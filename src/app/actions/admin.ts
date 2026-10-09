"use server";

import "server-only";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  ACTIVITY_TRANSLATABLE,
  CATEGORY_TRANSLATABLE,
  HERO_SLIDE_TRANSLATABLE,
  PLAN_TRANSLATABLE,
  SESSION_TRANSLATABLE,
  activities,
  attendances,
  categories,
  heroSlides,
  notificationRules,
  plans,
  sessions,
  subscriptions,
  ticketPrices,
  users,
  type Activity,
  type SessionRow,
} from "@/db/schema";
import { hashPassword, randomToken, requireAdmin, revokeUserSessions, sendVerificationEmail } from "@/lib/auth";
import { ADMIN_CLIENT_FIELDS, adminCreateClientSchema, adminUpdateClientSchema } from "@/lib/validation/account";
import { firstIssueMessage, readFields } from "@/lib/validation/form";
import {
  activateSubscription,
  fillMembershipSessions,
  grantAttendances,
  membershipEndsAt,
  newAttendanceState,
  packSlotsLeft,
} from "@/lib/subscriptions";
import { runReminderJob } from "@/lib/reminders";
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatTime,
  parseParisDateTime,
  safeLink,
  slugify,
} from "@/lib/format";
import { localize, readTranslations } from "@/lib/i18n/content";
import { appUrl, logAndSend } from "@/lib/mailer";
import { isRecurring, toActivityKind } from "@/lib/memberships";
import { savePlanPromotion } from "@/lib/promotions";
import { translatorFor } from "@/i18n/translator";

const str = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const num = (data: FormData, key: string) => {
  const value = Number(String(data.get(key) ?? "").replace(",", "."));
  return Number.isFinite(value) ? value : 0;
};
/** Durée saisie en heures dans l'administration (2 ; 1,5…), enregistrée en minutes. 90 minutes par défaut. */
const durationMinutes = (data: FormData) => Math.round(num(data, "durationHours") * 60) || 90;
const bool = (data: FormData, key: string) => data.get(key) === "on" || data.get(key) === "true";

/**
 * Redirection avec un message affiché par le composant Flash.
 * `message` est une clé de « admin.flash » (ex. « clientCreated ») ou une clé complète (ex. « validation.emailInvalid »).
 */
const withMessage = (path: string, kind: "ok" | "erreur", message: string) =>
  `${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(message)}`;

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

/* ------------------------------ catégories ------------------------------ */

const ACCENTS = ["amber", "violet", "emerald", "indigo", "teal", "sky", "rose", "orange"] as const;

function categoryValues(formData: FormData) {
  const accent = str(formData, "accent");
  return {
    name: str(formData, "name").slice(0, 120),
    description: str(formData, "description") || null,
    emoji: str(formData, "emoji").slice(0, 8) || "✨",
    imageUrl: safeLink(str(formData, "imageUrl")),
    accent: (ACCENTS as readonly string[]).includes(accent) ? accent : "amber",
    position: Math.round(num(formData, "position")),
    comingSoon: bool(formData, "comingSoon"),
    translations: readTranslations(formData, CATEGORY_TRANSLATABLE),
  };
}

export async function createCategoryAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const values = categoryValues(formData);
  if (!values.name) redirect(withMessage("/admin/categories", "erreur", "categoryNameRequired"));

  const slug = slugify(values.name) || `categorie-${Date.now()}`;
  const inserted = await db
    .insert(categories)
    .values({ ...values, slug })
    .onConflictDoNothing({ target: categories.slug })
    .returning({ id: categories.id });

  if (!inserted[0]) redirect(withMessage("/admin/categories", "erreur", "categorySlugTaken"));
  revalidatePath("/activites");
  redirect(withMessage("/admin/categories", "ok", "categoryCreated"));
}

export async function updateCategoryAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = num(formData, "id");
  const values = categoryValues(formData);
  if (!values.name) redirect(withMessage("/admin/categories", "erreur", "categoryNameRequired"));

  await db.update(categories).set(values).where(eq(categories.id, id));
  revalidatePath("/activites");
  revalidatePath("/admin/categories");
  redirect(withMessage("/admin/categories", "ok", "categoryUpdated"));
}

/**
 * Suppression refusée tant que des activités y sont rattachées : la clé étrangère
 * est en `cascade`, un effacement emporterait donc activités, séances et abonnements.
 */
export async function deleteCategoryAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = num(formData, "id");

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(activities)
    .where(eq(activities.categoryId, id));
  if (count > 0) redirect(withMessage("/admin/categories", "erreur", "categoryHasActivities"));

  await db.delete(categories).where(eq(categories.id, id));
  revalidatePath("/activites");
  redirect(withMessage("/admin/categories", "ok", "categoryDeleted"));
}

/* ------------------------------ carrousel ------------------------------- */

/** Valeurs d'une diapositive, ou la clé d'erreur à afficher. */
function slideValues(formData: FormData) {
  const rawImage = str(formData, "imageUrl");
  const rawLink = str(formData, "ctaUrl");
  const imageUrl = safeLink(rawImage);
  const ctaUrl = safeLink(rawLink);
  const values = {
    eyebrow: str(formData, "eyebrow").slice(0, 120) || null,
    title: str(formData, "title").slice(0, 180),
    text: str(formData, "text").slice(0, 600) || null,
    imageUrl: imageUrl ?? "",
    ctaLabel: str(formData, "ctaLabel").slice(0, 60) || null,
    ctaUrl,
    position: Math.round(num(formData, "position")),
    isActive: bool(formData, "isActive"),
    translations: readTranslations(formData, HERO_SLIDE_TRANSLATABLE, 600),
  };
  let error: string | null = null;
  if (!values.title) error = "slideTitleRequired";
  else if (!imageUrl) error = "slideImageInvalid";
  else if (rawLink && !ctaUrl) error = "slideLinkInvalid";
  return { values, error };
}

function revalidateSlides() {
  revalidatePath("/");
  revalidatePath("/admin/carrousel");
}

export async function createSlideAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const { values, error } = slideValues(formData);
  if (error) redirect(withMessage("/admin/carrousel", "erreur", error));

  await db.insert(heroSlides).values(values);
  revalidateSlides();
  redirect(withMessage("/admin/carrousel", "ok", "slideCreated"));
}

export async function updateSlideAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = num(formData, "id");
  const { values, error } = slideValues(formData);
  if (error) redirect(withMessage("/admin/carrousel", "erreur", error));

  await db.update(heroSlides).set(values).where(eq(heroSlides.id, id));
  revalidateSlides();
  redirect(withMessage("/admin/carrousel", "ok", "slideUpdated"));
}

export async function deleteSlideAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await db.delete(heroSlides).where(eq(heroSlides.id, num(formData, "id")));
  revalidateSlides();
  redirect(withMessage("/admin/carrousel", "ok", "slideDeleted"));
}

/* ------------------------------ activités ------------------------------- */

function activityValues(formData: FormData) {
  return {
    categoryId: num(formData, "categoryId"),
    kind: toActivityKind(str(formData, "kind")),
    name: str(formData, "name"),
    shortDescription: str(formData, "shortDescription") || null,
    description: str(formData, "description") || null,
    address: str(formData, "address") || null,
    city: str(formData, "city") || null,
    scheduleText: str(formData, "scheduleText") || null,
    durationMinutes: durationMinutes(formData),
    priceCents: Math.round(num(formData, "price") * 100),
    capacity: Math.round(num(formData, "capacity")) || 30,
    // Photo envoyée (/media/…) ou ancienne adresse http(s) ; toute autre valeur est ignorée.
    imageUrl: safeLink(str(formData, "imageUrl")),
    ticketUrl: externalLink(str(formData, "ticketUrl")),
    translations: readTranslations(formData, ACTIVITY_TRANSLATABLE),
  };
}

/** Adresse http(s) complète uniquement (billetterie externe) ; « www.site.com » est complété en https. */
function externalLink(value: string): string | null {
  if (!value) return null;
  const link = safeLink(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  return link && !link.startsWith("/") ? link : null;
}

/** Un lien de billetterie saisi mais inutilisable est refusé plutôt qu'ignoré en silence. */
const ticketUrlRejected = (formData: FormData, values: { ticketUrl: string | null }) =>
  Boolean(str(formData, "ticketUrl")) && !values.ticketUrl;

/**
 * Tarifs saisis dans le formulaire de l'activité (lignes tierId / tierName / tierPrice, dans l'ordre affiché).
 * Les lignes sans nom sont ignorées.
 */
function tierRows(formData: FormData) {
  const ids = formData.getAll("tierId").map((value) => Number(value) || null);
  const names = formData.getAll("tierName").map((value) => String(value).trim().slice(0, 120));
  const prices = formData.getAll("tierPrice").map((value) => Number(String(value).replace(",", ".")));
  return names
    .map((name, index) => ({
      id: ids[index] ?? null,
      name,
      priceCents: Math.max(Math.round((Number.isFinite(prices[index]) ? prices[index]! : 0) * 100), 0),
      position: index + 1,
    }))
    .filter((tier) => tier.name);
}

/**
 * Aligne les tarifs de l'activité sur le formulaire : mise à jour des lignes conservées (leur identifiant ne change
 * pas, un client en train de réserver n'est pas gêné), ajout des nouvelles, suppression de celles qui ont été retirées.
 */
async function syncTicketPrices(activityId: number, formData: FormData): Promise<void> {
  // Formulaire sans bloc « tarifs » (activité à séances) : on ne touche à rien.
  if (!formData.has("tiersPresent")) return;
  const rows = tierRows(formData);
  const existing = await db.select({ id: ticketPrices.id }).from(ticketPrices).where(eq(ticketPrices.activityId, activityId));
  const known = new Set(existing.map((row) => row.id));
  const kept = new Set<number>();

  for (const { id, ...values } of rows) {
    if (id && known.has(id)) {
      kept.add(id);
      await db.update(ticketPrices).set(values).where(eq(ticketPrices.id, id));
    } else {
      await db.insert(ticketPrices).values({ ...values, activityId });
    }
  }
  for (const { id } of existing) {
    if (!kept.has(id)) await db.delete(ticketPrices).where(eq(ticketPrices.id, id));
  }
}

export async function createActivityAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const values = activityValues(formData);
  if (!values.name) redirect(withMessage("/admin/activites", "erreur", "activityNameRequired"));
  if (ticketUrlRejected(formData, values)) redirect(withMessage("/admin/activites", "erreur", "ticketUrlInvalid"));
  // Date facultative : pour un événement ponctuel, elle crée directement la date mise en vente.
  const rawDate = str(formData, "startsAt");
  const startsAt = rawDate ? parseParisDateTime(rawDate) : null;
  if (rawDate && !startsAt) redirect(withMessage("/admin/activites", "erreur", "dateInvalid"));

  const slug = slugify(values.name) || `activite-${Date.now()}`;
  const inserted = await db
    .insert(activities)
    .values({ ...values, slug, status: "active" })
    .returning({ id: activities.id });
  const activityId = inserted[0]!.id;
  if (startsAt) {
    await db.insert(sessions).values({
      activityId,
      startsAt,
      durationMinutes: values.durationMinutes,
      location: [values.address, values.city].filter(Boolean).join(", ") || null,
      status: "scheduled",
    });
  }
  await syncTicketPrices(activityId, formData);
  redirect(withMessage(`/admin/activites/${activityId}`, "ok", "activityCreated"));
}

export async function updateActivityAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = num(formData, "id");
  const values = activityValues(formData);
  if (!values.name) redirect(withMessage(`/admin/activites/${id}`, "erreur", "activityNameRequired"));
  if (ticketUrlRejected(formData, values)) redirect(withMessage(`/admin/activites/${id}`, "erreur", "ticketUrlInvalid"));
  await db
    .update(activities)
    .set({ ...values, status: str(formData, "status") === "hidden" ? "hidden" : "active" })
    .where(eq(activities.id, id));
  await syncTicketPrices(id, formData);
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

  await db.insert(sessions).values({
    activityId,
    title: str(formData, "title") || null,
    startsAt,
    durationMinutes: durationMinutes(formData),
    location: str(formData, "location") || null,
    notes: str(formData, "notes") || null,
    translations: readTranslations(formData, SESSION_TRANSLATABLE),
    status: "scheduled",
  });

  // Les abonnés à qui il reste des séances dans leur pack y sont inscrits.
  await fillMembershipSessions(activityId);
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
  const before = await loadSessionWithActivity(id);
  const [updated] = await db
    .update(sessions)
    .set({
      title: str(formData, "title") || null,
      startsAt,
      durationMinutes: durationMinutes(formData),
      location: str(formData, "location") || null,
      notes: str(formData, "notes") || null,
      translations: readTranslations(formData, SESSION_TRANSLATABLE),
      status: str(formData, "status") || "scheduled",
    })
    .where(eq(sessions.id, id))
    .returning();
  // Date, lieu, durée, intitulé, informations ou statut modifiés : les inscrits sont prévenus par e-mail.
  if (before && updated) await notifySessionChange(before.session, updated, before.activity);
  // Séance annulée ou reportée d'ici : elle n'est plus décomptée, les abonnés sont inscrits à la suivante.
  if (activityId) await fillMembershipSessions(activityId);
  revalidatePath("/admin/seances");
  redirect(withMessage(backTo, "ok", "sessionUpdated"));
}

async function loadSessionWithActivity(id: number) {
  return (
    await db
      .select({ session: sessions, activity: activities })
      .from(sessions)
      .innerJoin(activities, eq(activities.id, sessions.activityId))
      .where(eq(sessions.id, id))
      .limit(1)
  )[0];
}

/** Ce qui a changé dans une séance et qui intéresse un inscrit (dans l'ordre affiché dans l'e-mail). */
function sessionChanges(before: SessionRow, after: SessionRow) {
  const changes: ("rescheduled" | "when" | "duration" | "place" | "title" | "notes")[] = [];
  if (before.status !== "scheduled") changes.push("rescheduled");
  if (before.startsAt.getTime() !== after.startsAt.getTime()) changes.push("when");
  if (before.durationMinutes !== after.durationMinutes) changes.push("duration");
  if ((before.location ?? "") !== (after.location ?? "")) changes.push("place");
  if ((before.title ?? "") !== (after.title ?? "")) changes.push("title");
  if ((before.notes ?? "") !== (after.notes ?? "")) changes.push("notes");
  return changes;
}

/**
 * Prévient par e-mail tous les inscrits d'une séance qui vient d'être modifiée par l'administration :
 *  - séance annulée ou reportée ;
 *  - séance maintenue dont la date, l'heure, la durée, le lieu, l'intitulé ou les informations ont changé
 *    (ou séance reprogrammée après une annulation ou un report).
 * Rien n'est envoyé si rien d'utile n'a changé, ni pour une séance déjà passée.
 * Chaque inscrit reçoit l'e-mail dans sa langue, avec le contenu traduit s'il existe.
 */
async function notifySessionChange(before: SessionRow, after: SessionRow, activityRow: Activity): Promise<void> {
  const stopped = after.status === "cancelled" || after.status === "postponed";
  const changes = stopped ? [] : sessionChanges(before, after);
  if (stopped ? before.status === after.status : after.status !== "scheduled" || changes.length === 0) return;
  const now = Date.now();
  if (before.startsAt.getTime() <= now && after.startsAt.getTime() <= now) return;

  const participants = await db
    .select({ email: users.email, firstName: users.firstName, userId: users.id, locale: users.locale })
    .from(attendances)
    .innerJoin(users, eq(users.id, attendances.userId))
    .where(eq(attendances.sessionId, after.id));

  for (const participant of participants) {
    const { locale } = participant;
    const t = translatorFor(locale);
    const activity = localize(activityRow, locale, ACTIVITY_TRANSLATABLE);
    const session = localize(after, locale, SESSION_TRANSLATABLE);
    const title = session.title ?? activity.name;
    const common = { userId: participant.userId, sessionId: after.id, recipient: participant.email, locale };

    if (stopped) {
      const values = { title, date: formatDateTime(before.startsAt, locale) };
      await logAndSend({
        ...common,
        type: "session_cancelled",
        subject:
          after.status === "cancelled"
            ? t("emails.sessionChanged.subjectCancelled", { activity: activity.name })
            : t("emails.sessionChanged.subjectPostponed", { activity: activity.name }),
        body: [
          t("emails.hello", { name: participant.firstName }),
          "",
          after.status === "cancelled"
            ? t("emails.sessionChanged.cancelled", values)
            : t("emails.sessionChanged.postponed", values),
          session.notes ? t("emails.sessionChanged.info", { notes: session.notes }) : "",
          "",
          t("emails.team"),
        ].join("\n"),
      });
      continue;
    }

    const place = session.location || [activity.address, activity.city].filter(Boolean).join(", ");
    await logAndSend({
      ...common,
      type: "session_updated",
      subject: t("emails.sessionUpdated.subject", { activity: activity.name }),
      body: [
        t("emails.hello", { name: participant.firstName }),
        "",
        t("emails.sessionUpdated.intro", {
          title,
          changes: changes.map((change) => t(`emails.sessionUpdated.changes.${change}`)).join(t("emails.sessionUpdated.separator")),
        }),
        ...(changes.includes("when")
          ? [t("emails.sessionUpdated.previousDate", { date: formatDateTime(before.startsAt, locale) })]
          : []),
        "",
        t("emails.sessionUpdated.current"),
        t("emails.reminder.activity", { value: activity.name }),
        t("emails.reminder.date", { value: formatDate(after.startsAt, locale) }),
        t("emails.reminder.time", {
          time: formatTime(after.startsAt, locale),
          duration: formatDuration(after.durationMinutes, locale),
        }),
        t("emails.reminder.place", { value: place || t("emails.reminder.placeTbc") }),
        ...(session.notes ? [t("emails.sessionChanged.info", { notes: session.notes })] : []),
        "",
        t("emails.sessionUpdated.follow"),
        `${appUrl()}/espace-personnel`,
        "",
        t("emails.team"),
      ].join("\n"),
    });
  }
}

export async function setSessionStatusAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = num(formData, "id");
  const status = str(formData, "status") || "scheduled";
  const requested = str(formData, "redirectTo");
  const redirectTo = requested.startsWith("/admin/") ? requested : "/admin/seances";

  const row = await loadSessionWithActivity(id);
  const [updated] = await db.update(sessions).set({ status }).where(eq(sessions.id, id)).returning();
  // Annulation, report ou reprogrammation : les inscrits sont prévenus par e-mail.
  if (row && updated) await notifySessionChange(row.session, updated, row.activity);

  // Une séance annulée ou reportée n'est pas décomptée des packs : les abonnés sont inscrits à la suivante.
  if (row) await fillMembershipSessions(row.session.activityId);

  revalidatePath(redirectTo);
  redirect(withMessage(redirectTo, "ok", "sessionStatusUpdated"));
}

export async function deleteSessionAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = num(formData, "id");
  const activityId = num(formData, "activityId");
  await db.delete(sessions).where(eq(sessions.id, id));
  if (activityId) await fillMembershipSessions(activityId);
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
  const session = (await db.select({ startsAt: sessions.startsAt }).from(sessions).where(eq(sessions.id, sessionId)).limit(1))[0];
  // Rattachement à l'abonnement actif du client pour cette activité, s'il en a un (jamais au billet d'une autre date) :
  // la séance est alors prise sur son pack, s'il lui en reste à attribuer ; sinon elle lui est offerte en plus.
  const membership = (
    await db
      .select({ id: subscriptions.id, sessionsIncluded: subscriptions.sessionsIncluded })
      .from(subscriptions)
      .innerJoin(sessions, eq(sessions.activityId, subscriptions.activityId))
      .where(
        and(
          eq(sessions.id, sessionId),
          eq(subscriptions.userId, userId),
          eq(subscriptions.kind, "membership"),
          eq(subscriptions.status, "active"),
        ),
      )
      .limit(1)
  )[0];
  const subscription =
    membership && (await packSlotsLeft(membership.id, membership.sessionsIncluded)) > 0 ? membership : null;

  await db
    .insert(attendances)
    .values({
      sessionId,
      userId,
      subscriptionId: subscription?.id ?? null,
      // Ajouté après la clôture des présences : l'administration le confirme du même geste.
      ...(session ? newAttendanceState(session.startsAt) : { status: "pending" as const }),
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

/** Les abonnements sont réservés aux activités à séances (un événement unique se vend par billet). */
async function activityOffersMemberships(activityId: number): Promise<boolean> {
  const row = (await db.select({ kind: activities.kind }).from(activities).where(eq(activities.id, activityId)).limit(1))[0];
  return row ? isRecurring(row) : false;
}

export async function createPlanAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const activityId = num(formData, "activityId");
  const values = planValues(formData);
  const back = planBackPath(formData);
  if (!activityId || !values.name) redirect(withMessage(back, "erreur", "planRequiredFields"));
  if (!(await activityOffersMemberships(activityId))) redirect(withMessage(back, "erreur", "planRecurringOnly"));
  const inserted = await db.insert(plans).values({ ...values, activityId }).returning({ id: plans.id });
  const promoError = await savePlanPromotion(inserted[0]!.id, activityId, formData);
  revalidatePath(back);
  // L'offre est créée même si la promotion saisie est incomplète : le message dit quoi corriger.
  if (promoError) redirect(withMessage(back, "erreur", promoError));
  redirect(withMessage(back, "ok", "planCreated"));
}

export async function updatePlanAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = num(formData, "id");
  const values = planValues(formData);
  const back = planBackPath(formData);
  if (!values.name) redirect(withMessage(back, "erreur", "planRequiredFields"));
  const current = (await db.select({ activityId: plans.activityId }).from(plans).where(eq(plans.id, id)).limit(1))[0];
  if (!current || !(await activityOffersMemberships(current.activityId))) {
    redirect(withMessage(back, "erreur", "planRecurringOnly"));
  }
  await db.update(plans).set(values).where(eq(plans.id, id));
  const promoError = await savePlanPromotion(id, current.activityId, formData);
  revalidatePath(back);
  if (promoError) redirect(withMessage(back, "erreur", promoError));
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
    const [updated] = await db
      .update(subscriptions)
      .set({ paymentStatus: "paid", status: "active" })
      .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)))
      .returning();
    if (updated) await grantAttendances(updated);
  } else if (action === "extend") {
    // Une séance offerte : le pack s'agrandit d'une séance, et l'abonnement repart s'il était terminé.
    const [updated] = await db
      .update(subscriptions)
      .set({ sessionsIncluded: sql`${subscriptions.sessionsIncluded} + 1`, status: "active" })
      .where(and(eq(subscriptions.id, id), eq(subscriptions.kind, "membership")))
      .returning();
    if (updated) await grantAttendances(updated);
  }

  const requested = str(formData, "redirectTo");
  const redirectTo = requested.startsWith("/admin/") ? requested : "/admin/clients";
  revalidatePath(redirectTo);
  redirect(withMessage(redirectTo, "ok", action === "extend" ? "packSessionAdded" : "subscriptionUpdated"));
}

/* ------------------------- abonnés d'une formule ------------------------- */

/** Référence de paiement d'un abonnement ajouté par l'administration (aucun paiement en ligne). */
const ADMIN_PAYMENT_REFERENCE = "administration";

/** Libère les séances à venir réservées par un abonnement (retrait du client ou changement de formule). */
async function releaseUpcomingAttendances(subscriptionId: number): Promise<void> {
  await db
    .delete(attendances)
    .where(
      and(
        eq(attendances.subscriptionId, subscriptionId),
        sql`${attendances.sessionId} in (select s.id from sessions s where s.starts_at > now())`,
      ),
    );
}

/** Retour au tableau des inscrits, sur l'activité et la formule qui y étaient affichées. */
function subscribersBackPath(formData: FormData): string {
  const query = new URLSearchParams();
  for (const key of ["inscritsActivite", "inscritsFormule"]) {
    const value = Math.round(num(formData, key));
    if (value > 0) query.set(key, String(value));
  }
  return query.size > 0 ? `/admin/abonnements?${query}` : "/admin/abonnements";
}

/** Le client a-t-il déjà cette formule, payée et en cours ? Une commande jamais payée ne compte pas. */
async function hasPaidMembership(userId: number, planId: number): Promise<boolean> {
  const rows = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.planId, planId),
        inArray(subscriptions.status, ["pending", "active"]),
        eq(subscriptions.paymentStatus, "paid"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** L'administration inscrit un client à une formule : abonnement actif tout de suite, sans paiement en ligne. */
export async function addPlanSubscriberAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const back = subscribersBackPath(formData);
  const planId = num(formData, "planId");
  const userId = num(formData, "userId");

  const [plan, client] = await Promise.all([
    db.select().from(plans).where(eq(plans.id, planId)).limit(1),
    db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1),
  ]);
  if (!client[0]) redirect(withMessage(back, "erreur", "clientNotFound"));
  if (!plan[0] || !(await activityOffersMemberships(plan[0].activityId))) {
    redirect(withMessage(back, "erreur", "planRecurringOnly"));
  }
  if (await hasPaidMembership(userId, planId)) redirect(withMessage(back, "erreur", "subscriberAlreadyOnPlan"));

  const startsAt = new Date();
  const inserted = await db
    .insert(subscriptions)
    .values({
      userId,
      kind: "membership",
      planId,
      activityId: plan[0].activityId,
      status: "pending",
      paymentStatus: "pending",
      paymentReference: ADMIN_PAYMENT_REFERENCE,
      startsAt,
      endsAt: membershipEndsAt(startsAt),
      sessionsIncluded: plan[0].sessionsIncluded,
      sessionsUsed: 0,
    })
    .returning({ id: subscriptions.id });
  // Activation : présences aux prochaines séances et e-mail de confirmation au client.
  await activateSubscription(inserted[0]!.id);

  revalidatePath("/admin/abonnements");
  redirect(withMessage(back, "ok", "subscriberAdded"));
}

/**
 * Retire un client d'une formule : l'abonnement est annulé (jamais effacé, pour garder la trace du paiement)
 * et ses séances à venir sont libérées.
 */
export async function removePlanSubscriberAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const back = subscribersBackPath(formData);
  const id = num(formData, "id");
  const row = (await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1))[0];
  if (!row || row.kind !== "membership") redirect(withMessage(back, "erreur", "subscriberNotFound"));

  // Un paiement réellement encaissé reste compté ; un ajout de l'administration ou une commande impayée, non.
  const keepPaid = row.paymentStatus === "paid" && row.paymentReference !== ADMIN_PAYMENT_REFERENCE;
  await db
    .update(subscriptions)
    .set({ status: "cancelled", paymentStatus: keepPaid ? "paid" : "cancelled" })
    .where(eq(subscriptions.id, id));
  await releaseUpcomingAttendances(id);

  revalidatePath("/admin/abonnements");
  redirect(withMessage(back, "ok", "subscriberRemoved"));
}

/**
 * Corrige une erreur d'achat : l'abonnement passe sur la formule d'une autre activité, au même prix uniquement
 * (aucun complément ni remboursement à gérer). Les séances à venir de l'ancienne activité sont libérées et
 * celles de la nouvelle attribuées.
 */
export async function changeSubscriptionPlanAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const back = subscribersBackPath(formData);
  const id = num(formData, "id");
  const targetPlanId = num(formData, "planId");

  const current = (
    await db
      .select({ subscription: subscriptions, plan: plans })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .where(eq(subscriptions.id, id))
      .limit(1)
  )[0];
  if (!current || current.subscription.kind !== "membership" || current.subscription.status === "cancelled") {
    redirect(withMessage(back, "erreur", "subscriberNotFound"));
  }
  // Seul un abonnement payé se déplace : une commande impayée n'est pas une inscription.
  if (current.subscription.paymentStatus !== "paid") redirect(withMessage(back, "erreur", "planChangeUnpaid"));
  const target = (await db.select().from(plans).where(eq(plans.id, targetPlanId)).limit(1))[0];
  if (
    !target ||
    target.activityId === current.plan.activityId ||
    target.priceCents !== current.plan.priceCents ||
    !(await activityOffersMemberships(target.activityId))
  ) {
    redirect(withMessage(back, "erreur", "planChangeNotAllowed"));
  }
  if (await hasPaidMembership(current.subscription.userId, target.id)) {
    redirect(withMessage(back, "erreur", "subscriberAlreadyOnPlan"));
  }

  // Le pack prend la taille de la nouvelle formule ; les séances déjà décomptées le restent.
  const [updated] = await db
    .update(subscriptions)
    .set({
      planId: target.id,
      activityId: target.activityId,
      sessionsIncluded: target.sessionsIncluded,
    })
    .where(and(eq(subscriptions.id, id), eq(subscriptions.planId, current.plan.id)))
    .returning();
  if (updated) {
    await releaseUpcomingAttendances(id);
    if (updated.status === "active") await grantAttendances(updated);
  }

  revalidatePath("/admin/abonnements");
  redirect(withMessage(back, "ok", "planChanged"));
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
