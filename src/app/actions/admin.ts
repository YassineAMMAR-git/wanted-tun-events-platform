"use server";

import "server-only";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import {
  ACTIVITY_TRANSLATABLE,
  PLAN_TRANSLATABLE,
  SESSION_TRANSLATABLE,
  activities,
  attendances,
  notificationRules,
  plans,
  sessions,
  subscriptions,
  users,
} from "@/db/schema";
import { hashPassword, randomToken, requireAdmin, revokeUserSessions, sendVerificationEmail } from "@/lib/auth";
import { ADMIN_CLIENT_FIELDS, adminCreateClientSchema, adminUpdateClientSchema } from "@/lib/validation/account";
import { firstIssueMessage, readFields } from "@/lib/validation/form";
import { activateSubscription, attachSubscribersToSession, ensureAttendances } from "@/lib/subscriptions";
import { runReminderJob } from "@/lib/reminders";
import { formatDateTime, parseParisDateTime, slugify } from "@/lib/format";
import { localize, readTranslations } from "@/lib/i18n/content";
import { logAndSend } from "@/lib/mailer";
import { translatorFor } from "@/i18n/translator";

const str = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const num = (data: FormData, key: string) => {
  const value = Number(String(data.get(key) ?? "").replace(",", "."));
  return Number.isFinite(value) ? value : 0;
};
const bool = (data: FormData, key: string) => data.get(key) === "on" || data.get(key) === "true";

/**
 * Redirection avec un message affiché par le composant Flash.
 * `message` est une clé de « admin.flash » (ex. « clientCreated ») ou une clé complète (ex. « validation.emailInvalid »).
 */
const withMessage = (path: string, kind: "ok" | "erreur", message: string) =>
  `${path}?${kind}=${encodeURIComponent(message)}`;

/* ------------------------------- clients -------------------------------- */

export async function createClientAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = adminCreateClientSchema.safeParse(readFields(formData, ADMIN_CLIENT_FIELDS));
  if (!parsed.success) redirect(withMessage("/admin/clients", "erreur", firstIssueMessage(parsed.error)));
  const data = parsed.data;

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email)).limit(1);
  if (existing.length > 0) redirect(withMessage("/admin/clients", "erreur", "emailTaken"));

  const inserted = await db
    .insert(users)
    .values({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      city: data.city,
      passwordHash: await hashPassword(data.password),
      role: data.role,
      locale: data.locale,
      notes: data.notes,
    })
    .onConflictDoNothing({ target: users.email })
    .returning();
  if (!inserted[0]) redirect(withMessage("/admin/clients", "erreur", "emailTaken"));

  // Le compte reste inactif tant que son titulaire n'a pas confirmé son adresse e-mail.
  await sendVerificationEmail(inserted[0]);
  revalidatePath("/admin/clients");
  redirect(withMessage("/admin/clients", "ok", "clientCreated"));
}

export async function updateClientAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = adminUpdateClientSchema.safeParse(readFields(formData, ADMIN_CLIENT_FIELDS));
  const rawId = Number(formData.get("id"));
  const back = Number.isInteger(rawId) && rawId > 0 ? `/admin/clients/${rawId}` : "/admin/clients";
  if (!parsed.success) redirect(withMessage(back, "erreur", firstIssueMessage(parsed.error)));
  const data = parsed.data;

  const current = (await db.select().from(users).where(eq(users.id, data.id)).limit(1))[0];
  if (!current) redirect(withMessage("/admin/clients", "erreur", "clientNotFound"));
  if (current.id === admin.id && data.role !== "admin") redirect(withMessage(back, "erreur", "cannotDemoteSelf"));

  const emailChanged = data.email !== current.email;
  if (emailChanged) {
    const taken = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email)).limit(1);
    if (taken.length > 0) redirect(withMessage(back, "erreur", "emailTaken"));
  }
  const passwordChanged = data.password !== "";
  const roleChanged = data.role !== current.role;

  const updated = await db
    .update(users)
    .set({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      city: data.city,
      role: data.role,
      locale: data.locale,
      notes: data.notes,
      ...(passwordChanged ? { passwordHash: await hashPassword(data.password) } : {}),
      // Une nouvelle adresse doit être confirmée par son titulaire avant de pouvoir se connecter.
      ...(emailChanged ? { emailVerifiedAt: null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, data.id))
    .returning();

  if (emailChanged || passwordChanged || roleChanged) {
    await revokeUserSessions(data.id, { keepCurrent: data.id === admin.id });
  }
  if (emailChanged && updated[0]) await sendVerificationEmail(updated[0]);

  revalidatePath(back);
  redirect(withMessage(back, "ok", emailChanged ? "clientUpdatedEmail" : "clientUpdated"));
}

export async function resendClientVerificationAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = num(formData, "id");
  const back = `/admin/clients/${id}`;
  const client = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
  if (!client) redirect(withMessage("/admin/clients", "erreur", "clientNotFound"));

  const result = await sendVerificationEmail(client);
  const messages = {
    sent: ["ok", "verificationResent"],
    throttled: ["erreur", "verificationThrottled"],
    "already-verified": ["ok", "alreadyVerified"],
  } as const;
  const [kind, message] = messages[result];
  redirect(withMessage(back, kind, message));
}

export async function deleteClientAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = num(formData, "id");
  if (id === admin.id) redirect(withMessage("/admin/clients", "erreur", "cannotDeleteSelf"));
  await db.delete(users).where(eq(users.id, id));
  redirect(withMessage("/admin/clients", "ok", "clientDeleted"));
}

/* ------------------------------ activités ------------------------------- */

function activityValues(formData: FormData) {
  return {
    categoryId: num(formData, "categoryId"),
    name: str(formData, "name"),
    shortDescription: str(formData, "shortDescription") || null,
    description: str(formData, "description") || null,
    address: str(formData, "address") || null,
    city: str(formData, "city") || null,
    scheduleText: str(formData, "scheduleText") || null,
    durationMinutes: Math.round(num(formData, "durationMinutes")) || 90,
    priceCents: Math.round(num(formData, "price") * 100),
    capacity: Math.round(num(formData, "capacity")) || 30,
    imageUrl: str(formData, "imageUrl") || null,
    translations: readTranslations(formData, ACTIVITY_TRANSLATABLE),
  };
}

export async function createActivityAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const values = activityValues(formData);
  if (!values.name) redirect(withMessage("/admin/activites", "erreur", "activityNameRequired"));
  const slug = slugify(values.name) || `activite-${Date.now()}`;
  const inserted = await db
    .insert(activities)
    .values({ ...values, slug, status: "active" })
    .returning({ id: activities.id });
  redirect(withMessage(`/admin/activites/${inserted[0]!.id}`, "ok", "activityCreated"));
}

export async function updateActivityAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = num(formData, "id");
  const values = activityValues(formData);
  if (!values.name) redirect(withMessage(`/admin/activites/${id}`, "erreur", "activityNameRequired"));
  await db
    .update(activities)
    .set({ ...values, status: str(formData, "status") === "hidden" ? "hidden" : "active" })
    .where(eq(activities.id, id));
  revalidatePath("/admin/activites");
  redirect(withMessage(`/admin/activites/${id}`, "ok", "activityUpdated"));
}

export async function deleteActivityAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = num(formData, "id");
  await db.delete(activities).where(eq(activities.id, id));
  redirect(withMessage("/admin/activites", "ok", "activityDeleted"));
}

/* -------------------------------- séances -------------------------------- */

export async function createSessionAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const activityId = num(formData, "activityId");
  const startsAt = parseParisDateTime(str(formData, "startsAt"));
  if (!activityId || !startsAt) redirect(withMessage(`/admin/activites/${activityId}`, "erreur", "dateRequired"));

  const inserted = await db
    .insert(sessions)
    .values({
      activityId,
      title: str(formData, "title") || null,
      startsAt,
      durationMinutes: Math.round(num(formData, "durationMinutes")) || 90,
      location: str(formData, "location") || null,
      notes: str(formData, "notes") || null,
      translations: readTranslations(formData, SESSION_TRANSLATABLE),
      status: "scheduled",
    })
    .returning({ id: sessions.id });

  await attachSubscribersToSession(inserted[0]!.id, activityId);
  revalidatePath("/admin/seances");
  redirect(withMessage(`/admin/activites/${activityId}`, "ok", "sessionAdded"));
}

export async function updateSessionAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = num(formData, "id");
  const activityId = num(formData, "activityId");
  const startsAt = parseParisDateTime(str(formData, "startsAt"));
  const backTo = str(formData, "redirectTo") === "session" ? `/admin/seances/${id}` : activityId ? `/admin/activites/${activityId}` : "/admin/seances";
  if (!startsAt) redirect(withMessage(backTo, "erreur", "dateInvalid"));
  await db
    .update(sessions)
    .set({
      title: str(formData, "title") || null,
      startsAt,
      durationMinutes: Math.round(num(formData, "durationMinutes")) || 90,
      location: str(formData, "location") || null,
      notes: str(formData, "notes") || null,
      translations: readTranslations(formData, SESSION_TRANSLATABLE),
      status: str(formData, "status") || "scheduled",
    })
    .where(eq(sessions.id, id));
  revalidatePath("/admin/seances");
  redirect(withMessage(backTo, "ok", "sessionUpdated"));
}

export async function setSessionStatusAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = num(formData, "id");
  const status = str(formData, "status") || "scheduled";
  const requested = str(formData, "redirectTo");
  const redirectTo = requested.startsWith("/admin/") ? requested : "/admin/seances";

  const row = (
    await db
      .select({ session: sessions, activity: activities })
      .from(sessions)
      .innerJoin(activities, eq(activities.id, sessions.activityId))
      .where(eq(sessions.id, id))
      .limit(1)
  )[0];

  await db.update(sessions).set({ status }).where(eq(sessions.id, id));

  if (row && (status === "cancelled" || status === "postponed")) {
    const participants = await db
      .select({ email: users.email, firstName: users.firstName, userId: users.id, locale: users.locale })
      .from(attendances)
      .innerJoin(users, eq(users.id, attendances.userId))
      .where(eq(attendances.sessionId, id));

    for (const participant of participants) {
      // Chaque participant reçoit l'e-mail dans sa langue, avec le contenu traduit s'il existe.
      const { locale } = participant;
      const t = translatorFor(locale);
      const activity = localize(row.activity, locale, ACTIVITY_TRANSLATABLE);
      const session = localize(row.session, locale, SESSION_TRANSLATABLE);
      const values = { title: session.title ?? activity.name, date: formatDateTime(row.session.startsAt, locale) };

      await logAndSend({
        type: "session_cancelled",
        userId: participant.userId,
        sessionId: id,
        recipient: participant.email,
        locale,
        subject:
          status === "cancelled"
            ? t("emails.sessionChanged.subjectCancelled", { activity: activity.name })
            : t("emails.sessionChanged.subjectPostponed", { activity: activity.name }),
        body: [
          t("emails.hello", { name: participant.firstName }),
          "",
          status === "cancelled"
            ? t("emails.sessionChanged.cancelled", values)
            : t("emails.sessionChanged.postponed", values),
          session.notes ? t("emails.sessionChanged.info", { notes: session.notes }) : "",
          "",
          t("emails.team"),
        ].join("\n"),
      });
    }
  }

  revalidatePath(redirectTo);
  redirect(withMessage(redirectTo, "ok", "sessionStatusUpdated"));
}

export async function deleteSessionAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = num(formData, "id");
  const activityId = num(formData, "activityId");
  await db.delete(sessions).where(eq(sessions.id, id));
  redirect(withMessage(activityId ? `/admin/activites/${activityId}` : "/admin/seances", "ok", "sessionDeleted"));
}

/* ------------------------------ participations --------------------------- */

export async function setAttendanceStatusAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = num(formData, "id");
  const sessionId = num(formData, "sessionId");
  const status = str(formData, "status") || "pending";
  await db
    .update(attendances)
    .set({ status, respondedAt: new Date(), responseChannel: "administration" })
    .where(eq(attendances.id, id));
  revalidatePath(`/admin/seances/${sessionId}`);
  redirect(withMessage(`/admin/seances/${sessionId}`, "ok", "attendanceUpdated"));
}

export async function addParticipantAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const sessionId = num(formData, "sessionId");
  const userId = num(formData, "userId");
  const subscription = (
    await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active"), gte(subscriptions.endsAt, new Date())))
      .limit(1)
  )[0];

  await db
    .insert(attendances)
    .values({
      sessionId,
      userId,
      subscriptionId: subscription?.id ?? null,
      status: "pending",
      token: randomToken(),
    })
    .onConflictDoNothing();
  redirect(withMessage(`/admin/seances/${sessionId}`, "ok", "participantAdded"));
}

export async function removeParticipantAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = num(formData, "id");
  const sessionId = num(formData, "sessionId");
  await db.delete(attendances).where(eq(attendances.id, id));
  redirect(withMessage(`/admin/seances/${sessionId}`, "ok", "participantRemoved"));
}

/* ------------------------------ abonnements ------------------------------ */

function planValues(formData: FormData) {
  return {
    name: str(formData, "name"),
    description: str(formData, "description") || null,
    priceCents: Math.round(num(formData, "price") * 100),
    sessionsIncluded: Math.round(num(formData, "sessionsIncluded")) || 1,
    validityDays: Math.round(num(formData, "validityDays")) || 30,
    address: str(formData, "address") || null,
    scheduleText: str(formData, "scheduleText") || null,
    extraInfo: str(formData, "extraInfo") || null,
    paymentUrl: str(formData, "paymentUrl") || null,
    isActive: bool(formData, "isActive"),
    translations: readTranslations(formData, PLAN_TRANSLATABLE),
  };
}

/** Page d'origine du formulaire d'offre (liste des offres ou fiche activité). */
function planBackPath(formData: FormData): string {
  const requested = str(formData, "redirectTo");
  return requested.startsWith("/admin/") ? requested : "/admin/abonnements";
}

export async function createPlanAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const activityId = num(formData, "activityId");
  const values = planValues(formData);
  const back = planBackPath(formData);
  if (!activityId || !values.name) redirect(withMessage(back, "erreur", "planRequiredFields"));
  await db.insert(plans).values({ ...values, activityId });
  revalidatePath(back);
  redirect(withMessage(back, "ok", "planCreated"));
}

export async function updatePlanAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = num(formData, "id");
  const values = planValues(formData);
  const back = planBackPath(formData);
  if (!values.name) redirect(withMessage(back, "erreur", "planRequiredFields"));
  await db.update(plans).set(values).where(eq(plans.id, id));
  revalidatePath(back);
  redirect(withMessage(back, "ok", "planUpdated"));
}

export async function togglePlanAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = num(formData, "id");
  const isActive = str(formData, "isActive") === "true";
  await db.update(plans).set({ isActive }).where(eq(plans.id, id));
  revalidatePath("/admin/abonnements");
  redirect(withMessage("/admin/abonnements", "ok", "planUpdated"));
}

export async function deletePlanAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await db.delete(plans).where(eq(plans.id, num(formData, "id")));
  redirect(withMessage("/admin/abonnements", "ok", "planDeleted"));
}

/* --------------------------- abonnements clients ------------------------- */

export async function setSubscriptionStatusAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = num(formData, "id");
  const userId = num(formData, "userId");
  const action = str(formData, "action");

  if (action === "activate") {
    await activateSubscription(id);
  } else if (action === "cancel") {
    await db
      .update(subscriptions)
      .set({ status: "cancelled", paymentStatus: "cancelled" })
      .where(eq(subscriptions.id, id));
  } else if (action === "markPaid") {
    await db
      .update(subscriptions)
      .set({ paymentStatus: "paid", status: "active" })
      .where(eq(subscriptions.id, id));
    await ensureAttendances({ userId, activityId: num(formData, "activityId"), subscriptionId: id, limit: num(formData, "sessionsIncluded") });
  } else if (action === "extend") {
    const row = (await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1))[0];
    if (row) {
      await db
        .update(subscriptions)
        .set({ endsAt: new Date(row.endsAt.getTime() + 30 * 24 * 60 * 60 * 1000), status: "active" })
        .where(eq(subscriptions.id, id));
    }
  }

  const requested = str(formData, "redirectTo");
  const redirectTo = requested.startsWith("/admin/") ? requested : "/admin/clients";
  revalidatePath(redirectTo);
  redirect(withMessage(redirectTo, "ok", "subscriptionUpdated"));
}

/* ---------------------------- notifications ----------------------------- */

export async function toggleRuleAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = num(formData, "id");
  const isEnabled = str(formData, "isEnabled") === "true";
  await db.update(notificationRules).set({ isEnabled }).where(eq(notificationRules.id, id));
  revalidatePath("/admin/notifications");
  redirect(withMessage("/admin/notifications", "ok", "ruleUpdated"));
}

export async function updateRuleAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await db
    .update(notificationRules)
    .set({
      label: str(formData, "label"),
      offsetHours: Math.round(num(formData, "offsetHours")),
      channel: str(formData, "channel") || "email",
    })
    .where(eq(notificationRules.id, num(formData, "id")));
  revalidatePath("/admin/notifications");
  redirect(withMessage("/admin/notifications", "ok", "ruleUpdated"));
}

export async function runRemindersAction(): Promise<void> {
  await requireAdmin();
  await runReminderJob();
  revalidatePath("/admin/notifications");
  redirect(withMessage("/admin/notifications", "ok", "remindersRun"));
}
