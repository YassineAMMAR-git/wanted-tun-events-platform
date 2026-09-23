import "server-only";
import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  ACTIVITY_TRANSLATABLE,
  CATEGORY_TRANSLATABLE,
  PLAN_TRANSLATABLE,
  SESSION_TRANSLATABLE,
  activities,
  attendances,
  categories,
  notificationRules,
  notifications,
  plans,
  sessions,
  subscriptions,
  users,
} from "@/db/schema";
import type { Locale } from "@/i18n/config";
import { localize } from "@/lib/i18n/content";

/*
 * Requêtes des pages publiques et de l'espace personnel : le contenu est renvoyé dans la langue demandée
 * (traduction si elle existe, texte français sinon). Les pages d'administration lisent les valeurs brutes.
 */

export async function getCategoriesWithCounts(locale: Locale) {
  const rows = await db
    .select({
      category: categories,
      activityCount: sql<number>`count(distinct case when ${activities.status} = 'active' then ${activities.id} end)::int`,
    })
    .from(categories)
    .leftJoin(activities, eq(activities.categoryId, categories.id))
    .groupBy(categories.id)
    .orderBy(asc(categories.position), asc(categories.id));

  return rows.map(({ category, activityCount }) => ({
    ...localize(category, locale, CATEGORY_TRANSLATABLE),
    activityCount,
  }));
}

export async function getUpcomingSessions(locale: Locale, limit = 5) {
  const rows = await db
    .select({ session: sessions, activity: activities, emoji: categories.emoji })
    .from(sessions)
    .innerJoin(activities, eq(activities.id, sessions.activityId))
    .innerJoin(categories, eq(categories.id, activities.categoryId))
    .where(and(eq(sessions.status, "scheduled"), gte(sessions.startsAt, new Date())))
    .orderBy(asc(sessions.startsAt))
    .limit(limit);

  return rows.map(({ session, activity, emoji }) => ({
    id: session.id,
    startsAt: session.startsAt,
    location: session.location,
    activityName: localize(activity, locale, ACTIVITY_TRANSLATABLE).name,
    activitySlug: activity.slug,
    emoji,
  }));
}

export async function listActivities(locale: Locale, options: { categorySlug?: string; search?: string } = {}) {
  const filters = [eq(activities.status, "active")];
  if (options.categorySlug) filters.push(eq(categories.slug, options.categorySlug));

  const rows = await db
    .select({
      activity: activities,
      category: categories,
      sessionCount: sql<number>`(select count(*) from sessions s where s.activity_id = ${activities.id} and s.starts_at >= now() and s.status = 'scheduled')::int`,
      planCount: sql<number>`(select count(*) from plans p where p.activity_id = ${activities.id} and p.is_active = true)::int`,
      minPrice: sql<
        number | null
      >`(select min(p.price_cents) from plans p where p.activity_id = ${activities.id} and p.is_active = true)::int`,
      nextSession: sql<
        Date | null
      >`(select min(s.starts_at) from sessions s where s.activity_id = ${activities.id} and s.starts_at >= now() and s.status = 'scheduled')`,
    })
    .from(activities)
    .innerJoin(categories, eq(categories.id, activities.categoryId))
    .where(and(...filters))
    .orderBy(asc(categories.position), asc(activities.name));

  const normalized = rows.map(({ activity, category, ...rest }) => {
    const localizedCategory = localize(category, locale, CATEGORY_TRANSLATABLE);
    return {
      ...rest,
      activity: localize(activity, locale, ACTIVITY_TRANSLATABLE),
      categoryName: localizedCategory.name,
      categorySlug: category.slug,
      categoryEmoji: category.emoji,
      comingSoon: category.comingSoon,
      nextSession: toDate(rest.nextSession),
    };
  });

  if (!options.search) return normalized;
  const needle = options.search.toLowerCase();
  // Recherche dans la langue affichée et en français (les deux versions correspondent).
  const french = new Map(rows.map((row) => [row.activity.id, row.activity]));
  return normalized.filter((row) => {
    const original = french.get(row.activity.id);
    return [row.activity.name, row.activity.description, row.activity.city, original?.name, original?.description]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(needle));
  });
}

/** Les expressions SQL brutes renvoient parfois une chaîne : on normalise en Date. */
function toDate(value: Date | string | null): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

export async function getActivityDetail(slug: string, locale: Locale) {
  const row = (
    await db
      .select({ activity: activities, category: categories })
      .from(activities)
      .innerJoin(categories, eq(categories.id, activities.categoryId))
      .where(eq(activities.slug, slug))
      .limit(1)
  )[0];
  if (!row) return null;

  const [plansList, upcoming, past] = await Promise.all([
    db
      .select()
      .from(plans)
      .where(and(eq(plans.activityId, row.activity.id), eq(plans.isActive, true)))
      .orderBy(asc(plans.priceCents)),
    db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.activityId, row.activity.id),
          eq(sessions.status, "scheduled"),
          gte(sessions.startsAt, new Date()),
        ),
      )
      .orderBy(asc(sessions.startsAt))
      .limit(12),
    db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.activityId, row.activity.id),
          lt(sessions.startsAt, new Date()),
          eq(sessions.status, "scheduled"),
        ),
      )
      .orderBy(desc(sessions.startsAt))
      .limit(6),
  ]);

  return {
    activity: localize(row.activity, locale, ACTIVITY_TRANSLATABLE),
    categoryName: localize(row.category, locale, CATEGORY_TRANSLATABLE).name,
    categorySlug: row.category.slug,
    categoryEmoji: row.category.emoji,
    plans: plansList.map((plan) => localize(plan, locale, PLAN_TRANSLATABLE)),
    upcoming: upcoming.map((session) => localize(session, locale, SESSION_TRANSLATABLE)),
    past: past.map((session) => localize(session, locale, SESSION_TRANSLATABLE)),
  };
}

export async function listActivePlans(locale: Locale) {
  const rows = await db
    .select({ plan: plans, activity: activities, category: categories })
    .from(plans)
    .innerJoin(activities, eq(activities.id, plans.activityId))
    .innerJoin(categories, eq(categories.id, activities.categoryId))
    .where(eq(plans.isActive, true))
    .orderBy(asc(categories.position), asc(plans.priceCents));

  return rows.map((row) => ({
    plan: localize(row.plan, locale, PLAN_TRANSLATABLE),
    activity: localize(row.activity, locale, ACTIVITY_TRANSLATABLE),
    categoryName: localize(row.category, locale, CATEGORY_TRANSLATABLE).name,
    categoryEmoji: row.category.emoji,
  }));
}

export async function getMySubscriptions(userId: number, locale: Locale) {
  const rows = await db
    .select({
      subscription: subscriptions,
      plan: plans,
      activity: activities,
      category: categories,
      attendedCount: sql<number>`(select count(*) from attendances a join sessions s on s.id = a.session_id where a.subscription_id = ${subscriptions.id} and s.starts_at < now())::int`,
      upcomingCount: sql<number>`(select count(*) from attendances a join sessions s on s.id = a.session_id where a.subscription_id = ${subscriptions.id} and s.starts_at >= now())::int`,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .innerJoin(activities, eq(activities.id, subscriptions.activityId))
    .innerJoin(categories, eq(categories.id, activities.categoryId))
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.createdAt));

  return rows.map(({ plan, activity, category, ...rest }) => ({
    ...rest,
    plan: localize(plan, locale, PLAN_TRANSLATABLE),
    activity: localize(activity, locale, ACTIVITY_TRANSLATABLE),
    categoryName: localize(category, locale, CATEGORY_TRANSLATABLE).name,
    categoryEmoji: category.emoji,
  }));
}

export async function getMySessions(userId: number, locale: Locale) {
  const rows = await db
    .select({ attendance: attendances, session: sessions, activity: activities, category: categories })
    .from(attendances)
    .innerJoin(sessions, eq(sessions.id, attendances.sessionId))
    .innerJoin(activities, eq(activities.id, sessions.activityId))
    .innerJoin(categories, eq(categories.id, activities.categoryId))
    .where(eq(attendances.userId, userId))
    .orderBy(asc(sessions.startsAt));

  return rows.map(({ session, activity, category, attendance }) => ({
    attendance,
    session: localize(session, locale, SESSION_TRANSLATABLE),
    activity: localize(activity, locale, ACTIVITY_TRANSLATABLE),
    categoryName: localize(category, locale, CATEGORY_TRANSLATABLE).name,
    categoryEmoji: category.emoji,
  }));
}

export async function getNotifications(limit = 60) {
  return db
    .select({
      notification: notifications,
      userName: users.firstName,
      userLastName: users.lastName,
    })
    .from(notifications)
    .leftJoin(users, eq(users.id, notifications.userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function getNotificationRules() {
  return db.select().from(notificationRules).orderBy(asc(notificationRules.id));
}

export async function getAdminStats() {
  const [counts] = await db
    .select({
      clients: sql<number>`(select count(*) from users where role = 'client')::int`,
      activities: sql<number>`(select count(*) from activities)::int`,
      sessions: sql<number>`(select count(*) from sessions)::int`,
      upcomingSessions: sql<number>`(select count(*) from sessions where starts_at >= now() and status = 'scheduled')::int`,
      activeSubscriptions: sql<number>`(select count(*) from subscriptions where status = 'active')::int`,
      pendingPayments: sql<number>`(select count(*) from subscriptions where payment_status = 'pending')::int`,
      confirmations: sql<number>`(select count(*) from attendances where status = 'confirmed')::int`,
      awaiting: sql<number>`(select count(*) from attendances where status = 'pending')::int`,
      declines: sql<number>`(select count(*) from attendances where status = 'declined')::int`,
      reminders: sql<number>`(select count(*) from notifications where type = 'reminder_48h')::int`,
    })
    .from(sql`(select 1) as one`);
  return counts;
}
