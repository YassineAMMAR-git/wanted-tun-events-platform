"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

/** Doit rester égal à MAX_DOCUMENT_BYTES (src/lib/session-documents.ts). */
const MAX_BYTES = 4 * 1024 * 1024;

type Props = {
  sessionId: number;
  documents: { id: number; fileName: string; sizeLabel: string }[];
  /** Page où revenir après l'envoi ou la suppression (le tableau des séances, filtres compris). */
  returnTo: string;
  deleteAction: (formData: FormData) => Promise<void>;
};

/**
 * Cellule « Documents » du tableau des séances : PDF déjà joints (ouvrir, supprimer) et bouton d'ajout.
 * Le fichier choisi est envoyé aussitôt ; le navigateur vérifie avant le type et la taille,
 * pour éviter un refus brutal de l'hébergeur au-delà de 4,5 Mo.
 */
export function SessionDocumentsCell({ sessionId, documents, returnTo, deleteAction }: Props) {
  const t = useTranslations("admin.sessions");
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function onFile(file: File | undefined) {
    if (!file) return;
    const problem =
      !/\.pdf$/i.test(file.name) && file.type !== "application/pdf"
        ? t("documentNotPdf")
        : file.size > MAX_BYTES
          ? t("documentTooLarge")
          : null;
    if (problem) {
      setError(problem);
      if (input.current) input.current.value = "";
      return;
    }
    setError(null);
    setBusy(true);
    form.current?.submit();
  }

  return (
    <div className="flex w-44 flex-col gap-1.5">
      {documents.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center gap-1.5">
              <a
                href={`/documents/${doc.id}`}
                className="min-w-0 flex-1 truncate text-xs text-zinc-800 hover:text-gold-dark"
                title={`${doc.fileName} (${doc.sizeLabel})`}
              >
                📄 {doc.fileName}
              </a>
              <form
                action={deleteAction}
                onSubmit={(event) => {
                  if (!window.confirm(t("documentDeleteConfirm", { name: doc.fileName }))) event.preventDefault();
                }}
              >
                <input type="hidden" name="id" value={doc.id} />
                <input type="hidden" name="sessionId" value={sessionId} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <button
                  type="submit"
                  className="rounded px-1 text-xs text-rose-700 hover:bg-rose-50"
                  title={t("documentDelete", { name: doc.fileName })}
                  aria-label={t("documentDelete", { name: doc.fileName })}
                >
                  ✕
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}

      <form
        ref={form}
        action={`/api/admin/seances/${sessionId}/documents`}
        method="post"
        encType="multipart/form-data"
      >
        <input type="hidden" name="returnTo" value={returnTo} />
        <input
          ref={input}
          name="file"
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          tabIndex={-1}
          disabled={busy}
          onChange={(event) => onFile(event.target.files?.[0])}
        />
        <button
          type="button"
          className="btn btn-ghost btn-sm whitespace-nowrap"
          disabled={busy}
          title={t("documentHint")}
          onClick={() => input.current?.click()}
        >
          {busy ? t("documentUploading") : t("documentAdd")}
        </button>
      </form>

      {error ? (
        <p role="alert" className="text-xs text-rose-700">
          ⚠️ {error}
        </p>
      ) : null}
    </div>
  );
}
