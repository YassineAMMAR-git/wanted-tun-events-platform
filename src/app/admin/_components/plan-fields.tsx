import { useTranslations } from "next-intl";
import type { Plan } from "@/db/schema";
import type { PromoPlanOption, Promotion } from "@/lib/promotions";
import { centsToEurosInput } from "@/lib/format";
import { TranslationFields } from "@/components/translation-fields";

type Props = {
  /** Offre existante (modification) ; absente pour une création. */
  plan?: Plan;
  /** Valeurs proposées à la création (adresse et horaires de l'activité). */
  defaults?: { address?: string | null; scheduleText?: string | null };
  /** Promotion déjà réglée sur cette offre. */
  promotion?: Promotion;
  /** Formules qui peuvent donner droit à la promotion. */
  promoPlans: PromoPlanOption[];
  /** Activité de l'offre, si elle est connue : ses propres formules ne sont pas proposées. */
  activityId?: number;
};

/** Champs d'une offre d'abonnement, communs à la page Offres et à la fiche activité. */
export function PlanFields({ plan, defaults, promotion, promoPlans, activityId }: Props) {
  const t = useTranslations("admin.planForm");
  const promoOptions = promoPlans.filter((option) => option.activityId !== activityId && option.id !== plan?.id);

  return (
    <>
      <div className="sm:col-span-2 lg:col-span-4">
        <TranslationFields
          gridClassName="grid gap-3 sm:grid-cols-2"
          values={{
            name: plan?.name,
            description: plan?.description,
            scheduleText: plan?.scheduleText ?? defaults?.scheduleText,
            extraInfo: plan?.extraInfo,
          }}
          translations={plan?.translations}
          fields={[
            { name: "name", label: plan ? t("name") : t("nameRequired"), required: true, maxLength: 160 },
            { name: "scheduleText", label: t("schedule"), maxLength: 200 },
            { name: "description", label: t("description"), maxLength: 2000, className: "sm:col-span-2" },
            { name: "extraInfo", label: t("extraInfo"), maxLength: 2000, className: "sm:col-span-2" },
          ]}
        />
      </div>
      <div>
        <label className="label">{t("price")}</label>
        <input
          name="price"
          type="number"
          step="0.01"
          min={0}
          defaultValue={plan ? centsToEurosInput(plan.priceCents) : 0}
          className="input"
        />
      </div>
      <div>
        <label className="label">{t("sessionsIncluded")}</label>
        <input name="sessionsIncluded" type="number" min={1} defaultValue={plan?.sessionsIncluded ?? 4} className="input" />
      </div>
      <div>
        <label className="label">{t("active")}</label>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" name="isActive" defaultChecked={plan?.isActive ?? true} className="h-4 w-4" />
          {t("visible")}
        </label>
      </div>
      <div className="sm:col-span-2">
        <label className="label">{t("paymentUrl")}</label>
        <input
          name="paymentUrl"
          type="url"
          defaultValue={plan?.paymentUrl ?? ""}
          className="input"
          placeholder="https://buy.stripe.com/…"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="label">{t("address")}</label>
        <input name="address" maxLength={240} defaultValue={plan?.address ?? defaults?.address ?? ""} className="input" />
      </div>
      <fieldset className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 sm:col-span-2 lg:col-span-4">
        <legend className="px-1 text-sm font-semibold text-gold-dark">🏷️ {t("promoTitle")}</legend>
        <label className="flex items-center gap-2 text-sm text-zinc-800">
          <input type="checkbox" name="promoEnabled" defaultChecked={Boolean(promotion)} className="h-4 w-4" />
          {t("promoEnabled")}
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-[10rem_1fr]">
          <div>
            <label className="label">{t("promoPercent")}</label>
            <input
              name="promoPercent"
              type="number"
              min={1}
              max={99}
              step={1}
              defaultValue={promotion?.percent ?? 20}
              className="input"
            />
          </div>
          <div>
            <label className="label">{t("promoPlans")}</label>
            <select
              name="promoPlanIds"
              multiple
              size={Math.min(Math.max(promoOptions.length, 2), 6)}
              defaultValue={(promotion?.requiredPlanIds ?? []).map(String)}
              className="select h-auto"
            >
              {promoOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-zinc-500">{t("promoPlansHint")}</p>
          </div>
        </div>
      </fieldset>
    </>
  );
}
