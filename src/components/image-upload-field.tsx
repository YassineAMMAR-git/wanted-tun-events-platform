"use client";

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/** Plus grand côté après compression : assez pour un fond plein écran, léger à charger. */
const MAX_SIDE = 1920;
const QUALITY = 0.82;

/**
 * Réduit et recompresse la photo dans le navigateur (WebP, ou JPEG si le navigateur ne sait pas produire du WebP).
 * Une photo de téléphone de 5 à 10 Mo passe ainsi à quelques centaines de Ko avant l'envoi.
 */
async function compress(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY));
  const webp = await encode("image/webp");
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await encode("image/jpeg");
  if (!jpeg) throw new Error("encode");
  return jpeg;
}

type Props = {
  /** Nom du champ envoyé avec le formulaire (l'adresse de la photo). */
  name: string;
  label: string;
  defaultValue?: string | null;
  required?: boolean;
  hint?: string;
  /** Proportions de l'aperçu (fond d'activité, bannière du carrousel…). */
  aspectClassName?: string;
};

/**
 * Champ « photo » de l'administration : choix d'un fichier, compression, envoi immédiat,
 * puis l'adresse obtenue (/media/…) est enregistrée avec le reste du formulaire.
 */
export function ImageUploadField({ name, label, defaultValue, required, hint, aspectClassName = "aspect-[16/9]" }: Props) {
  const t = useTranslations("admin.imageUpload");
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(defaultValue ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError(t("errorType"));
      return;
    }
    setBusy(true);
    try {
      let blob: Blob;
      try {
        blob = await compress(file);
      } catch {
        setError(t("errorType"));
        return;
      }
      const body = new FormData();
      body.append("file", blob, blob.type === "image/webp" ? "photo.webp" : "photo.jpg");
      const response = await fetch("/api/admin/images", { method: "POST", body });
      const json = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!response.ok || !json.url) {
        setError(json.error === "tooLarge" ? t("errorSize") : json.error === "type" ? t("errorType") : t("errorUpload"));
        return;
      }
      setUrl(json.url);
    } catch {
      setError(t("errorUpload"));
    } finally {
      setBusy(false);
      // Permet de choisir à nouveau le même fichier après une erreur.
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
        {required ? " *" : ""}
      </label>
      {/* L'adresse est envoyée avec le formulaire ; une photo obligatoire manquante est refusée par le serveur. */}
      <input type="hidden" name={name} value={url} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div
          className={`relative w-full overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 sm:w-56 ${aspectClassName}`}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-zinc-500">🖼️ {t("none")}</div>
          )}
          {busy ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-xs font-medium text-zinc-700">
              {t("uploading")}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <input
            ref={input}
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="sr-only"
            disabled={busy}
            onChange={(event) => onFile(event.target.files?.[0])}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => input.current?.click()}>
              📷 {url ? t("change") : t("choose")}
            </button>
            {url && !required ? (
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setUrl("")}>
                {t("remove")}
              </button>
            ) : null}
          </div>
          <p className="text-xs text-zinc-500">{hint ?? t("hint")}</p>
          {error ? (
            <p role="alert" className="text-xs text-rose-700">
              ⚠️ {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
