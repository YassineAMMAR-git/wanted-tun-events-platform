"use client";

import type { Option } from "@/components/filter-bar";

/** Liste déroulante d'un formulaire GET qui s'applique dès qu'on change de valeur, sans bouton à cliquer. */
export function AutoSubmitSelect({
  name,
  label,
  value,
  options,
  placeholder,
}: {
  name: string;
  label: string;
  value?: string;
  options: Option[];
  /** Première option, valeur vide : « toutes ». */
  placeholder?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <select
        // La valeur vient de l'URL : la liste est recréée quand elle change (autre activité → « toutes les formules »).
        key={value ?? ""}
        id={name}
        name={name}
        defaultValue={value ?? ""}
        className="select"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
