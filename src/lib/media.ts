import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { images } from "@/db/schema";

/** Taille maximale acceptée (la photo est déjà compressée dans le navigateur ; Vercel refuse au-delà de 4,5 Mo). */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** Préfixe des adresses des photos envoyées : /media/12. */
export const MEDIA_PREFIX = "/media/";

/** Type réel du fichier, lu dans ses premiers octets (le type annoncé par le navigateur n'est pas fiable). */
export function sniffImageType(data: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

export async function saveImage(data: Buffer, contentType: string): Promise<string> {
  const [row] = await db.insert(images).values({ contentType, data, size: data.length }).returning({ id: images.id });
  return `${MEDIA_PREFIX}${row!.id}`;
}

export async function getImage(id: number) {
  return (await db.select().from(images).where(eq(images.id, id)).limit(1))[0] ?? null;
}

/**
 * Supprime les photos qui ne sont plus utilisées (remplacées, ou envoyées sans que le formulaire soit enregistré).
 * Délai d'un jour : une photo tout juste envoyée dont le formulaire est encore ouvert n'est pas touchée.
 */
export async function deleteOrphanImages(): Promise<number> {
  const url = sql`${MEDIA_PREFIX} || ${images.id}::text`;
  const deleted = await db
    .delete(images)
    .where(
      and(
        lt(images.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
        sql`not exists (select 1 from activities a where a.image_url = ${url})`,
        sql`not exists (select 1 from hero_slides h where h.image_url = ${url})`,
      ),
    )
    .returning({ id: images.id });
  return deleted.length;
}
