"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

type Row = { key: number; id: number | null; name: string; price: string };

type Props = {
  /** Tarifs déjà enregistrés (fiche d'une activité) ; vide à la création. */
  initial?: { id: number; name: string; priceCents: number }[];
};

/**
 * Tarifs d'un événement (Chaises 40 €, Gradin 20 €…), saisis dans le formulaire de l'activité sous le prix du billet.
 * Chaque ligne envoie tierId / tierName / tierPrice ; l'enregistrement de l'activité met la liste à jour.
 */
export function TicketPriceFields({ initial = [] }: Props) {
  const t = useTranslations("admin.tiers");
  const nextKey = useRef(initial.length);
  const [rows, setRows] = useState<Row[]>(() =>
    initial.map((tier, index) => ({
      key: index,
      id: tier.id,
      name: tier.name,
      price: (tier.priceCents / 100).toFixed(2),
    })),
  );

  const update = (key: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  return (
    <div>
      {/* Indique au serveur que la liste des tarifs fait partie de ce formulaire (une liste vide les supprime tous). */}
      <input type="hidden" name="tiersPresent" value="1" />

      {rows.length > 0 ? (
        <div className="mb-2 space-y-2">
          {rows.map((row, index) => (
            <div key={row.key} className="grid gap-2 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
              <input type="hidden" name="tierId" value={row.id ?? ""} />
              <div>
                <label className="label" htmlFor={`tier-name-${row.key}`}>
                  {t("name", { row: index + 1 })}
                </label>
                <input
                  id={`tier-name-${row.key}`}
                  name="tierName"
                  required
                  maxLength={120}
                  value={row.name}
                  onChange={(event) => update(row.key, { name: event.target.value })}
                  placeholder={t("namePlaceholder")}
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor={`tier-price-${row.key}`}>
                  {t("price")}
                </label>
                <input
                  id={`tier-price-${row.key}`}
                  name="tierPrice"
                  type="number"
                  step="0.01"
                  min={0}
                  required
                  value={row.price}
                  onChange={(event) => update(row.key, { price: event.target.value })}
                  className="input"
                />
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
              >
                {t("remove")}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => {
          nextKey.current += 1;
          setRows((current) => [...current, { key: nextKey.current, id: null, name: "", price: "" }]);
        }}
      >
        ➕ {t("add")}
      </button>
      <p className="mt-1 text-xs text-zinc-500">{rows.length > 0 ? t("hintWithTiers") : t("hint")}</p>
    </div>
  );
}
