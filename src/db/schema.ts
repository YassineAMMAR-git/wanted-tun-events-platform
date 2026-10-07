import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import type { Locale, TranslatedLocale } from "@/i18n/config";

/**
 * Traductions d'un contenu saisi par l'administration. Le français est stocké dans les colonnes
 * habituelles ; l'anglais et l'arabe dans une colonne JSON. Un champ absent ou vide retombe sur le français.
 */
export type ContentTranslations<Field extends string> = Partial<Record<TranslatedLocale, Partial<Record<Field, string>>>>;

export const CATEGORY_TRANSLATABLE = ["name", "description"] as const;
export const ACTIVITY_TRANSLATABLE = ["name", "shortDescription", "description", "scheduleText"] as const;
export const PLAN_TRANSLATABLE = ["name", "description", "scheduleText", "extraInfo"] as const;
export const SESSION_TRANSLATABLE = ["title", "notes"] as const;
export const HERO_SLIDE_TRANSLATABLE = ["eyebrow", "title", "text", "ctaLabel"] as const;

/* ------------------------------------------------------------------ */
/* Utilisateurs (clients + administrateurs)                            */
/* ------------------------------------------------------------------ */
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    firstName: varchar("first_name", { length: 80 }).notNull(),
    lastName: varchar("last_name", { length: 80 }).notNull(),
    email: varchar("email", { length: 180 }).notNull(),
    phone: varchar("phone", { length: 40 }),
    city: varchar("city", { length: 120 }),
    passwordHash: text("password_hash").notNull(),
    role: varchar("role", { length: 16 }).$type<UserRole>().notNull().default("client"),
    notes: text("notes"),
    /** Langue préférée : interface après connexion et langue des e-mails. */
    locale: varchar("locale", { length: 5 }).$type<Locale>().notNull().default("fr"),
    /** null tant que l'adresse e-mail n'a pas été confirmée : la connexion est alors refusée. */
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const USER_ROLES = ["client", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/* ------------------------------------------------------------------ */
/* Sessions de connexion (jeton aléatoire, seul son empreinte est stockée) */
/* ------------------------------------------------------------------ */
export const userSessions = pgTable(
  "user_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: varchar("user_agent", { length: 255 }),
    ipAddress: varchar("ip_address", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_sessions_token_hash_unique").on(table.tokenHash),
    index("user_sessions_user_idx").on(table.userId),
  ],
);

/* ------------------------------------------------------------------ */
/* Jetons de vérification d'adresse e-mail (usage unique, durée limitée) */
/* ------------------------------------------------------------------ */
export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("email_verification_tokens_hash_unique").on(table.tokenHash),
    index("email_verification_tokens_user_idx").on(table.userId),
  ],
);

/* ------------------------------------------------------------------ */
/* Catégories d'activités                                              */
/* ------------------------------------------------------------------ */
export const categories = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull(),
    description: text("description"),
    emoji: varchar("emoji", { length: 8 }).default("✨"),
    /** Photo de la carte de catégorie (page d'accueil) ; sans photo, la carte n'affiche que l'emoji. */
    imageUrl: text("image_url"),
    accent: varchar("accent", { length: 32 }).default("amber"),
    position: integer("position").notNull().default(0),
    comingSoon: boolean("coming_soon").notNull().default(false),
    translations: jsonb("translations")
      .$type<ContentTranslations<(typeof CATEGORY_TRANSLATABLE)[number]>>()
      .notNull()
      .default({}),
  },
  (table) => [uniqueIndex("categories_slug_unique").on(table.slug)],
);

/* ------------------------------------------------------------------ */
/* Activités (cours / ateliers / événements)                           */
/* ------------------------------------------------------------------ */

/**
 * Type d'événement, choisi par l'administration :
 * « single »    : événement unique (concert, soirée…) — une date, le client achète un billet ;
 * « recurring » : activité à séances — le client paie à la séance ou prend un abonnement.
 */
export const ACTIVITY_KINDS = ["single", "recurring"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export const activities = pgTable(
  "activities",
  {
    id: serial("id").primaryKey(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 180 }).notNull(),
    slug: varchar("slug", { length: 180 }).notNull(),
    /** Vide sur les activités antérieures à ce champ : renseigné au démarrage (voir backfillActivityKinds). */
    kind: varchar("kind", { length: 16 }).$type<ActivityKind>(),
    shortDescription: varchar("short_description", { length: 280 }),
    description: text("description"),
    address: varchar("address", { length: 240 }),
    city: varchar("city", { length: 120 }),
    scheduleText: varchar("schedule_text", { length: 200 }),
    durationMinutes: integer("duration_minutes").notNull().default(90),
    priceCents: integer("price_cents").notNull().default(0),
    capacity: integer("capacity").notNull().default(30),
    imageUrl: text("image_url"),
    status: varchar("status", { length: 16 }).notNull().default("active"),
    translations: jsonb("translations")
      .$type<ContentTranslations<(typeof ACTIVITY_TRANSLATABLE)[number]>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("activities_slug_unique").on(table.slug),
    index("activities_category_idx").on(table.categoryId),
  ],
);

/* ------------------------------------------------------------------ */
/* Séances                                                             */
/* ------------------------------------------------------------------ */
export const sessions = pgTable(
  "sessions",
  {
    id: serial("id").primaryKey(),
    activityId: integer("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 180 }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(90),
    location: varchar("location", { length: 240 }),
    status: varchar("status", { length: 16 }).notNull().default("scheduled"),
    notes: text("notes"),
    translations: jsonb("translations")
      .$type<ContentTranslations<(typeof SESSION_TRANSLATABLE)[number]>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sessions_activity_idx").on(table.activityId), index("sessions_start_idx").on(table.startsAt)],
);

/* ------------------------------------------------------------------ */
/* Offres d'abonnement                                                 */
/* ------------------------------------------------------------------ */
export const plans = pgTable(
  "plans",
  {
    id: serial("id").primaryKey(),
    activityId: integer("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    priceCents: integer("price_cents").notNull().default(0),
    sessionsIncluded: integer("sessions_included").notNull().default(1),
    validityDays: integer("validity_days").notNull().default(90),
    address: varchar("address", { length: 240 }),
    scheduleText: varchar("schedule_text", { length: 200 }),
    extraInfo: text("extra_info"),
    paymentUrl: text("payment_url"),
    isActive: boolean("is_active").notNull().default(true),
    translations: jsonb("translations")
      .$type<ContentTranslations<(typeof PLAN_TRANSLATABLE)[number]>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("plans_activity_idx").on(table.activityId)],
);

/* ------------------------------------------------------------------ */
/* Abonnements (club de chant) et billets (événements ponctuels)       */
/* ------------------------------------------------------------------ */

/**
 * « membership » : abonnement à une activité à séances (plan_id renseigné, plusieurs séances).
 * « ticket » : billet d'un événement unique, ou séance achetée à l'unité
 *              (plan_id vide, session_id = la date choisie, prix = celui de l'activité).
 */
export const SUBSCRIPTION_KINDS = ["membership", "ticket"] as const;
export type SubscriptionKind = (typeof SUBSCRIPTION_KINDS)[number];

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 16 }).$type<SubscriptionKind>().notNull().default("membership"),
    planId: integer("plan_id").references(() => plans.id, { onDelete: "cascade" }),
    activityId: integer("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    /** Billet : date de l'événement. La supprimer ne supprime pas le billet (payé) : il faut alors le rembourser. */
    sessionId: integer("session_id").references(() => sessions.id, { onDelete: "set null" }),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    paymentStatus: varchar("payment_status", { length: 16 }).notNull().default("pending"),
    paymentReference: varchar("payment_reference", { length: 120 }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    sessionsIncluded: integer("sessions_included").notNull().default(1),
    sessionsUsed: integer("sessions_used").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("subscriptions_user_idx").on(table.userId),
    index("subscriptions_activity_idx").on(table.activityId),
    index("subscriptions_session_idx").on(table.sessionId),
  ],
);

/* ------------------------------------------------------------------ */
/* Présence / confirmation par séance                                  */
/* ------------------------------------------------------------------ */
export const attendances = pgTable(
  "attendances",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subscriptionId: integer("subscription_id").references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    responseChannel: varchar("response_channel", { length: 16 }),
    token: varchar("token", { length: 64 }).notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("attendances_session_user_unique").on(table.sessionId, table.userId),
    uniqueIndex("attendances_token_unique").on(table.token),
    index("attendances_user_idx").on(table.userId),
  ],
);

/* ------------------------------------------------------------------ */
/* Journal des notifications automatiques                              */
/* ------------------------------------------------------------------ */
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
    sessionId: integer("session_id").references(() => sessions.id, { onDelete: "cascade" }),
    subscriptionId: integer("subscription_id").references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    type: varchar("type", { length: 40 }).notNull(),
    channel: varchar("channel", { length: 20 }).notNull().default("email"),
    recipient: varchar("recipient", { length: 180 }).notNull(),
    subject: varchar("subject", { length: 240 }).notNull(),
    body: text("body").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("queued"),
    provider: varchar("provider", { length: 40 }).notNull().default("journal"),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("notifications_type_session_idx").on(table.type, table.sessionId)],
);

/* ------------------------------------------------------------------ */
/* Règles de notification (J-2 par défaut, extensible)                 */
/* ------------------------------------------------------------------ */
export const notificationRules = pgTable(
  "notification_rules",
  {
    id: serial("id").primaryKey(),
    type: varchar("type", { length: 40 }).notNull(),
    label: varchar("label", { length: 160 }).notNull(),
    description: text("description"),
    offsetHours: integer("offset_hours").notNull().default(48),
    channel: varchar("channel", { length: 20 }).notNull().default("email"),
    isEnabled: boolean("is_enabled").notNull().default(true),
  },
  (table) => [uniqueIndex("notification_rules_type_unique").on(table.type)],
);

/* ------------------------------------------------------------------ */
/* Carrousel de la page d'accueil                                      */
/* ------------------------------------------------------------------ */
export const heroSlides = pgTable(
  "hero_slides",
  {
    id: serial("id").primaryKey(),
    eyebrow: varchar("eyebrow", { length: 120 }),
    title: varchar("title", { length: 180 }).notNull(),
    text: text("text"),
    imageUrl: text("image_url").notNull(),
    ctaLabel: varchar("cta_label", { length: 60 }),
    /** Chemin interne (« /activites ») ou adresse http(s). */
    ctaUrl: text("cta_url"),
    position: integer("position").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    translations: jsonb("translations")
      .$type<ContentTranslations<(typeof HERO_SLIDE_TRANSLATABLE)[number]>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("hero_slides_position_idx").on(table.position)],
);

/* ------------------------------------------------------------------ */
/* Photos envoyées depuis l'administration                             */
/* ------------------------------------------------------------------ */

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/**
 * Photos des activités et du carrousel, compressées dans le navigateur avant l'envoi (quelques centaines de Ko).
 * Servies par /media/{id} avec un cache long : une photo n'est jamais modifiée, une nouvelle photo = une nouvelle ligne.
 * Les photos qui ne sont plus utilisées nulle part sont supprimées par la tâche quotidienne.
 */
export const images = pgTable("images", {
  id: serial("id").primaryKey(),
  contentType: varchar("content_type", { length: 32 }).notNull(),
  data: bytea("data").notNull(),
  size: integer("size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Paiement en ligne via Mollie                                        */
/* ------------------------------------------------------------------ */

/**
 * Paiements Mollie, un par tentative de paiement d'un abonnement ou d'un billet.
 * external_id = identifiant Mollie (tr_…), url = page de paiement Mollie.
 */
export const paymentLinks = pgTable(
  "payment_links",
  {
    id: serial("id").primaryKey(),
    subscriptionId: integer("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    externalId: varchar("external_id", { length: 64 }).notNull(),
    url: text("url").notNull(),
    amountCents: integer("amount_cents").notNull(),
    /** open, processing (paiement reçu, confirmation en cours), paid, expired, canceled (annulé ou refusé). */
    status: varchar("status", { length: 16 }).notNull().default("open"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("payment_links_external_id_unique").on(table.externalId),
    index("payment_links_subscription_idx").on(table.subscriptionId),
  ],
);

export type User = typeof users.$inferSelect;
export type UserSession = typeof userSessions.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Attendance = typeof attendances.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
export type NotificationRule = typeof notificationRules.$inferSelect;
export type HeroSlide = typeof heroSlides.$inferSelect;
export type PaymentLink = typeof paymentLinks.$inferSelect;
