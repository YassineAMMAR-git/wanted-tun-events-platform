import { useTranslations } from "next-intl";
import type { Plan } from "@/db/schema";
import { centsToEurosInput } from "@/lib/format";
import { TranslationFields } from "@/components/translation-fields";

type Props = {
  /** Offre existante (modification) ; absente pour une création. */
  plan?: Plan;
  /** Valeurs proposées à la création (adresse et horaires de l'activité). */
  defaults?: { address?: string | null; scheduleText?: string | null };
};

/** Champs d'une offre d'abonnement, communs à la page Offres et à la fiche activité. */
export function PlanFields({ plan, defaults }: Props) {
  const t = useTranslations("admin.planForm");

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
        <label className="label">{t("validityDays")}</label>
        <input name="validityDays" type="number" min={1} defaultValue={plan?.validityDays ?? 45} className="input" />
      </div>
      <div>
        <label className="label">{t("active")}</label>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
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
    </>
  );
}
