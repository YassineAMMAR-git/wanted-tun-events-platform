import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui";

/**
 * Barre de filtres : un simple formulaire GET.
 *
 * Les critères vivent donc dans l'URL — une recherche se partage, se met en favori
 * et survit au rechargement — et le filtrage reste fait en base, côté serveur.
 * `action` est aussi la cible du bouton « Réinitialiser » (mêmes URL sans paramètre).
 */
export function FilterBar({
  action,
  active,
  submitLabel,
  resetLabel,
  children,
}: {
  action: string;
  active: boolean;
  submitLabel: string;
  resetLabel: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <form action={action} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {children}
        <div className="flex gap-2 lg:col-span-full lg:justify-end">
          <button className="btn btn-primary sm:w-auto" type="submit">
            {submitLabel}
          </button>
          {active ? (
            <Link href={action} className="btn btn-ghost sm:w-auto">
              {resetLabel}
            </Link>
          ) : null}
        </div>
      </form>
    </Card>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}

export function FilterText({
  name,
  label,
  defaultValue,
  placeholder,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <Field id={name} label={label}>
      <input
        id={name}
        name={name}
        maxLength={100}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className="input"
      />
    </Field>
  );
}

export type Option = { value: string; label: string };

export function FilterSelect({
  name,
  label,
  defaultValue,
  options,
  placeholder,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  options: Option[];
  /** Première option, valeur vide : « toutes », « toutes catégories »… */
  placeholder?: string;
}) {
  return (
    <Field id={name} label={label}>
      <select id={name} name={name} defaultValue={defaultValue ?? ""} className="select">
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function FilterDate({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue?: string;
}) {
  return (
    <Field id={name} label={label}>
      <input id={name} name={name} type="date" defaultValue={defaultValue ?? ""} className="input" />
    </Field>
  );
}
