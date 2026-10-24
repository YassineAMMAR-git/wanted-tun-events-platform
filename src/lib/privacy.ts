import "server-only";
import { headers } from "next/headers";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  attendances,
  emailVerificationTokens,
  notifications,
  passwordResetTokens,
  plans,
  sessions,
  subscriptions,
  userConsents,
  userSessions,
  users,
} from "@/db/schema";
import { clientIp } from "@/lib/auth";
import { LEGAL_VERSION } from "@/lib/site";

/*
 * Données personnelles (RGPD) : preuve d'acceptation des textes, droit d'accès et de portabilité (export),
 * droit à l'effacement (suppression du compte) et durées de conservation (purge quotidienne).
 */

export const TERMS_PRIVACY_DOCUMENT = "terms_privacy";

/** Un compte jamais activé (e-mail non confirmé) et sans commande est supprimé au bout de ce délai. */
export const UNVERIFIED_ACCOUNT_RETENTION_DAYS = 30;
/** Journal des e-mails envoyés (contenu et adresse du destinataire) : conservé 12 mois. */
export const NOTIFICATION_LOG_RETENTION_DAYS = 365;

let consentTable: Promise<void> | null = null;

/**
 * Crée la table des acceptations si elle manque : la base de production n'a pas à être migrée à la main.
 * Même définition que `userConsents` dans le schéma (noms de contrainte compris), pour que drizzle-kit n'y voie aucune différence.
 */
export function ensureConsentTable(): Promise<void> {
  consentTable ??= (async () => {
    await db.execute(sql`
      create table if not exists user_consents (
        id serial primary key,
        user_id integer not null,
        document varchar(40) not null,
        version varchar(20) not null,
        ip_address varchar(64),
        accepted_at timestamp with time zone not null default now(),
        constraint user_consents_user_id_users_id_fk foreign key (user_id) references users(id) on delete cascade
      )
    `);
    await db.execute(sql`create index if not exists user_consents_user_idx on user_consents (user_id)`);
  })().catch((error) => {
    consentTable = null;
    throw error;
  });
  return consentTable;
}

/** Enregistre l'acceptation des conditions générales et de la politique de confidentialité (version en vigueur). */
export async function recordTermsAcceptance(userId: number): Promise<void> {
  await ensureConsentTable();
  await db.insert(userConsents).values({
    userId,
    document: TERMS_PRIVACY_DOCUMENT,
    version: LEGAL_VERSION,
    ipAddress: clientIp(await headers()),
  });
}

/* ----------------------------- droit d'accès ----------------------------- */

/** Toutes les données personnelles d'un compte, pour le fichier « Télécharger mes données ». */
export async function exportUserData(userId: number) {
  await ensureConsentTable();
  const user = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!user) return null;

  const [orders, attendanceRows, consents, deviceSessions, emails] = await Promise.all([
    db
      .select({ subscription: subscriptions, activityName: activities.name, planName: plans.name })
      .from(subscriptions)
      .innerJoin(activities, eq(activities.id, subscriptions.activityId))
      .leftJoin(plans, eq(plans.id, subscriptions.planId))
      .where(eq(subscriptions.userId, userId))
      .orderBy(desc(subscriptions.createdAt)),
    db
      .select({ attendance: attendances, startsAt: sessions.startsAt, activityName: activities.name })
      .from(attendances)
      .innerJoin(sessions, eq(sessions.id, attendances.sessionId))
      .innerJoin(activities, eq(activities.id, sessions.activityId))
      .where(eq(attendances.userId, userId))
      .orderBy(desc(sessions.startsAt)),
    db.select().from(userConsents).where(eq(userConsents.userId, userId)).orderBy(desc(userConsents.acceptedAt)),
    db.select().from(userSessions).where(eq(userSessions.userId, userId)),
    db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    account: {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      city: user.city,
      role: user.role,
      language: user.locale,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      notesFromOrganiser: user.notes,
    },
    consents: consents.map(({ document, version, ipAddress, acceptedAt }) => ({ document, version, ipAddress, acceptedAt })),
    orders: orders.map(({ subscription: s, activityName, planName }) => ({
      reference: s.id,
      type: s.kind,
      activity: activityName,
      plan: planName,
      priceLabel: s.priceLabel,
      amountCents: s.amountCents,
      status: s.status,
      paymentStatus: s.paymentStatus,
      paymentReference: s.paymentReference,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      sessionsIncluded: s.sessionsIncluded,
      sessionsUsed: s.sessionsUsed,
      createdAt: s.createdAt,
    })),
    attendances: attendanceRows.map(({ attendance: a, startsAt, activityName }) => ({
      activity: activityName,
      sessionStartsAt: startsAt,
      status: a.status,
      respondedVia: a.responseChannel,
      respondedAt: a.respondedAt,
      checkedInAt: a.checkedInAt,
    })),
    activeLogins: deviceSessions.map(({ userAgent, ipAddress, createdAt, expiresAt }) => ({
      device: userAgent,
      ipAddress,
      createdAt,
      expiresAt,
    })),
    emailsSent: emails.map(({ type, recipient, subject, body, status, sentAt, createdAt }) => ({
      type,
      recipient,
      subject,
      body,
      status,
      sentAt,
      createdAt,
    })),
  };
}

/* --------------------------- droit à l'effacement --------------------------- */

/**
 * Suppression du compte à la demande de son titulaire.
 * Sans commande payée, tout est effacé. Avec des commandes payées, les pièces comptables doivent être conservées
 * 10 ans (Code de commerce, art. L123-22) : le compte est alors anonymisé (nom, e-mail, téléphone, ville, notes effacés,
 * connexion impossible) et seules les commandes restent, sans plus permettre d'identifier la personne.
 */
export async function deleteAccount(userId: number): Promise<"deleted" | "anonymized"> {
  await ensureConsentTable();
  return db.transaction(async (tx) => {
    const paid = await tx
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.paymentStatus, "paid")))
      .limit(1);

    if (paid.length === 0) {
      await tx.delete(users).where(eq(users.id, userId));
      return "deleted" as const;
    }

    await tx.delete(userSessions).where(eq(userSessions.userId, userId));
    await tx.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId));
    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
    await tx.delete(notifications).where(eq(notifications.userId, userId));
    await tx.delete(userConsents).where(eq(userConsents.userId, userId));
    // Plus de séances à venir ni de rappels : la personne a quitté la plateforme.
    await tx.execute(
      sql`delete from attendances where user_id = ${userId} and session_id in (select id from sessions where starts_at > now())`,
    );
    await tx.execute(
      sql`update subscriptions set status = 'cancelled' where user_id = ${userId} and status in ('pending', 'active')`,
    );
    await tx
      .update(users)
      .set({
        firstName: "Compte",
        lastName: "supprimé",
        email: `compte-supprime-${userId}@anonyme.invalid`,
        phone: null,
        city: null,
        notes: null,
        // Aucun mot de passe ne correspond à cette valeur : la connexion devient impossible.
        passwordHash: "deleted",
        emailVerifiedAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    return "anonymized" as const;
  });
}

/* --------------------------- durées de conservation --------------------------- */

/**
 * Tâche quotidienne : supprime les données dont la durée de conservation est dépassée
 * — sessions et liens expirés, comptes jamais activés et sans commande, journal des e-mails de plus de 12 mois.
 */
export async function purgeExpiredPersonalData() {
  const expiredSessions = await db.execute(sql`delete from user_sessions where expires_at < now()`);
  await db.execute(sql`delete from email_verification_tokens where expires_at < now()`);
  await db.execute(sql`delete from password_reset_tokens where expires_at < now()`);
  const unverifiedAccounts = await db.execute(sql`
    delete from users u
    where u.role = 'client'
      and u.email_verified_at is null
      and u.created_at < now() - make_interval(days => ${UNVERIFIED_ACCOUNT_RETENTION_DAYS})
      and not exists (select 1 from subscriptions s where s.user_id = u.id)
      and not exists (select 1 from attendances a where a.user_id = u.id)
  `);
  const oldNotifications = await db.execute(
    sql`delete from notifications where created_at < now() - make_interval(days => ${NOTIFICATION_LOG_RETENTION_DAYS})`,
  );
  return {
    sessions: expiredSessions.rowCount ?? 0,
    unverifiedAccounts: unverifiedAccounts.rowCount ?? 0,
    notifications: oldNotifications.rowCount ?? 0,
  };
}
