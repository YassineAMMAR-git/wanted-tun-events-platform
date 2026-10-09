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
  // Formules des autres activités, regroupées par activité (la liste arrive déjà triée).
  const promoGroups: { activityId: number; activityName: string; options: PromoPlanOption[] }[] = [];
  for (const option of promoPlans) {
    if (option.activityId === activityId || option.id === plan?.id) continue;
    const group = promoGroups.at(-1);
    if (group?.activityId === option.activityId) group.options.push(option);
    else promoGroups.push({ activityId: option.activityId, activityName: option.activityName, options: [option] });
  }
  const required = new Set(promotion?.requiredPlanIds ?? []);

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
            <p className="label">{t("promoPlans")}</p>
            {promoGroups.length === 0 ? (
              <p className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-500">{t("promoNoPlans")}</p>
            ) : (
              <div className="max-h-56 divide-y divide-zinc-100 overflow-y-auto rounded-xl border border-zinc-200 bg-white">
                {promoGroups.map((group) => (
                  <div key={group.activityId} className="px-3 py-2">
                    <p className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">{group.activityName}</p>
                    <div className="mt-1 grid gap-x-4 sm:grid-cols-2">
                      {group.options.map((option) => (
                        <label
                          key={option.id}
                          className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1.5 text-sm text-zinc-800 hover:bg-amber-50"
                        >
                          <input
                            type="checkbox"
                            name="promoPlanIds"
                            value={option.id}
                            defaultChecked={required.has(option.id)}
                            className="h-4 w-4 shrink-0 accent-amber-600"
                          />
                          <span className="min-w-0 truncate" title={option.planName}>
                            {option.planName}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-1 text-xs text-zinc-500">{t("promoPlansHint")}</p>
          </div>
        </div>
      </fieldset>
    </>
  );
}
