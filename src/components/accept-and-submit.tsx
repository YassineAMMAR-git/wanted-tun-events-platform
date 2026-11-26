"use client";

import { useState, type ReactNode } from "react";

/** Case à cocher obligatoire : le bouton d'envoi reste désactivé tant qu'elle n'est pas cochée. */
export function AcceptAndSubmit({
  name,
  acceptLabel,
  children,
  requireAccept,
}: {
  name: string;
  acceptLabel: ReactNode;
  children: ReactNode;
  requireAccept: boolean;
}) {
  const [accepted, setAccepted] = useState(false);
  const disabled = requireAccept && !accepted;

  return (
    <>
      {requireAccept ? (
        <label className="mb-3 flex items-start gap-2 text-sm text-zinc-800">
          <input
            type="checkbox"
            name={name}
            required
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-amber-600"
          />
          {acceptLabel}
        </label>
      ) : null}
      <button className="btn btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={disabled}>
        {children}
      </button>
    </>
  );
}
