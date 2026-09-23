import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/db";
import { ACTIVITY_TRANSLATABLE, PLAN_TRANSLATABLE, activities, plans, subscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { confirmPaymentAction } from "@/app/actions/booking";
import { formatDate, formatPrice } from "@/lib/format";
import { localize } from "@/lib/i18n/content";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  const { id } = await params;
  const subscriptionId = Number(id);
  if (!Number.isFinite(subscriptionId)) notFound();

  const [locale, t, tCommon] = await Promise.all([getLocale(), getTranslations("payment"), getTranslations("common")]);

  const row = (
    await db
      .select({ subscription: subscriptions, plan: plans, activity: activities })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .innerJoin(activities, eq(activities.id, subscriptions.activityId))
      .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.userId, user.id)))
      .limit(1)
  )[0];

  if (!row) notFound();
  const { subscription } = row;
  const plan = localize(row.plan, locale, PLAN_TRANSLATABLE);
  const activity = localize(row.activity, locale, ACTIVITY_TRANSLATABLE);
  const alreadyPaid = subscription.paymentStatus === "paid";
  const price = formatPrice(plan.priceCents, locale);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <nav className="text-sm text-zinc-500">
        <Link href={`/activites/${activity.slug}`} className="hover:text-amber-300">
          {activity.name}
        </Link>
        <span className="px-2">/</span>
        <span className="text-zinc-300">{t("breadcrumb")}</span>
      </nav>

      <div className="text-center">
        <p className="eyebrow">{t("step")}</p>
        <h1 className="mt-2 text-3xl font-black text-white">{t("title")}</h1>
        <p className="mt-2 text-sm text-zinc-400">{t("intro")}</p>
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs tracking-wider text-zinc-500 uppercase">{t("selectedPlan")}</p>
            <h2 className="mt-1 text-xl font-bold text-white">{plan.name}</h2>
            <p className="text-sm text-zinc-400">{activity.name}</p>
          </div>
          <div className="text-end">
            <p className="text-xs tracking-wider text-zinc-500 uppercase">{t("price")}</p>
            <p className="text-3xl font-black text-amber-300">{price}</p>
          </div>
        </div>

        <dl className="mt-6 grid gap-3 sm:grid-cols-2">
          {[
            [t("sessionsIncluded"), String(plan.sessionsIncluded)],
            [t("validity"), tCommon("days", { count: plan.validityDays })],
            [t("address"), plan.address ?? activity.address ?? tCommon("none")],
            [t("schedule"), plan.scheduleText ?? activity.scheduleText ?? tCommon("none")],
            [t("start"), formatDate(subscription.startsAt, locale)],
            [t("end"), formatDate(subscription.endsAt, locale)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-white/8 bg-white/3 p-3">
              <dt className="text-xs tracking-wider text-zinc-500 uppercase">{label}</dt>
              <dd className="mt-1 text-sm font-medium text-zinc-200">{value}</dd>
            </div>
          ))}
        </dl>

        {plan.extraInfo ? (
          <p className="mt-4 rounded-xl border border-white/8 bg-white/3 p-3 text-xs text-zinc-400">ℹ️ {plan.extraInfo}</p>
        ) : null}

        <div className="mt-6 rounded-xl border border-amber-300/25 bg-amber-300/8 p-4">
          <p className="text-sm font-semibold text-amber-200">{t("externalLink")}</p>
          <p className="mt-1 text-xs break-all text-zinc-400" dir="ltr">
            {plan.paymentUrl ?? t("notConfigured")}
          </p>
        </div>

        {alreadyPaid ? (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href="/espace-personnel" className="btn btn-primary flex-1">
              {t("seeSessions")}
            </Link>
            <span className="btn btn-ghost flex-1">{t("alreadyActive")}</span>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            <a href={plan.paymentUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="btn btn-primary w-full">
              {t("pay", { price })}
            </a>

            <form action={confirmPaymentAction} className="card border-amber-300/20 p-4">
              <input type="hidden" name="subscriptionId" value={subscription.id} />
              <label className="label" htmlFor="reference">
                {t("reference")}
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="reference"
                  name="reference"
                  className="input"
                  maxLength={120}
                  placeholder={t("referencePlaceholder")}
                  defaultValue={subscription.paymentReference ?? ""}
                />
                <button className="btn btn-ghost sm:w-auto" type="submit">
                  {t("paid")}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-zinc-500">{t("paidHint")}</p>
            </form>
          </div>
        )}
      </Card>

      <p className="text-center text-xs text-zinc-500">{t("help")}</p>
    </div>
  );
}
