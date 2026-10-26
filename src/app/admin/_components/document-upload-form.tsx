"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";

/** Doit rester égal à MAX_DOCUMENT_BYTES (src/lib/session-documents.ts). */
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Envoi d'un PDF pour une séance. Le formulaire est posté normalement (le serveur revient sur la fiche séance) ;
 * le navigateur vérifie avant l'envoi le type et la taille, pour éviter un refus brutal de l'hébergeur.
 */
export function DocumentUploadForm({ sessionId }: { sessionId: number }) {
  const t = useTranslations("admin.sessionDetail");
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      action={`/api/admin/seances/${sessionId}/documents`}
      method="post"
      encType="multipart/form-data"
      className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={(event) => {
        const file = (event.currentTarget.elements.namedItem("file") as HTMLInputElement).files?.[0];
        const problem = !file
          ? t("documentChoose")
          : !/\.pdf$/i.test(file.name) && file.type !== "application/pdf"
            ? t("documentNotPdf")
            : file.size > MAX_BYTES
              ? t("documentTooLarge")
              : null;
        if (problem) {
          event.preventDefault();
          setError(problem);
          return;
        }
        setError(null);
        setBusy(true);
      }}
    >
      <div className="flex-1">
        <label className="label" htmlFor={id}>
          {t("documentFile")}
        </label>
        <input
          id={id}
          name="file"
          type="file"
          accept="application/pdf,.pdf"
          required
          className="input"
          onChange={() => setError(null)}
        />
        <p className="mt-1 text-xs text-zinc-500">{t("documentHint")}</p>
        {error ? (
          <p role="alert" className="mt-1 text-xs text-rose-700">
            ⚠️ {error}
          </p>
        ) : null}
      </div>
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? t("documentUploading") : t("documentAdd")}
      </button>
    </form>
  );
}
