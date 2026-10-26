import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { attendances, sessionDocuments } from "@/db/schema";

/** Taille maximale d'un PDF (Vercel refuse les envois de plus de 4,5 Mo). */
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

/** Un PDF commence toujours par « %PDF- » (le type annoncé par le navigateur n'est pas fiable). */
export function isPdf(data: Buffer): boolean {
  return data.length >= 5 && data.toString("ascii", 0, 5) === "%PDF-";
}

/** Nom de fichier propre : sans chemin ni caractères de contrôle, terminé par .pdf, 200 caractères au plus. */
export function cleanFileName(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "")
    .replace(/[\u0000-\u001f\u007f"]/g, "")
    .trim();
  const withoutExt = base.replace(/\.pdf$/i, "").slice(0, 190) || "document";
  return `${withoutExt}.pdf`;
}

export async function saveSessionDocument(sessionId: number, fileName: string, data: Buffer) {
  await db.insert(sessionDocuments).values({ sessionId, fileName, data, size: data.length });
}

/** Documents des séances données (sans le contenu des fichiers), regroupés par séance. */
export async function listSessionDocuments(sessionIds: number[]) {
  const bySession = new Map<number, { id: number; fileName: string; size: number; createdAt: Date }[]>();
  if (sessionIds.length === 0) return bySession;
  let rows;
  try {
    rows = await db
      .select({
        id: sessionDocuments.id,
        sessionId: sessionDocuments.sessionId,
        fileName: sessionDocuments.fileName,
        size: sessionDocuments.size,
        createdAt: sessionDocuments.createdAt,
      })
      .from(sessionDocuments)
      .where(inArray(sessionDocuments.sessionId, sessionIds))
      .orderBy(asc(sessionDocuments.createdAt), asc(sessionDocuments.id));
  } catch (error) {
    // Table absente tant que « drizzle-kit push » n'a pas été lancé sur cette base : aucun document.
    console.error("[documents] lecture impossible", error);
    return bySession;
  }
  for (const { sessionId, ...doc } of rows) {
    const list = bySession.get(sessionId) ?? [];
    list.push(doc);
    bySession.set(sessionId, list);
  }
  return bySession;
}

export async function getSessionDocument(id: number) {
  return (await db.select().from(sessionDocuments).where(eq(sessionDocuments.id, id)).limit(1))[0] ?? null;
}

/** Un client peut télécharger les documents d'une séance à laquelle il est inscrit. */
export async function isEnrolled(userId: number, sessionId: number): Promise<boolean> {
  const row = await db
    .select({ id: attendances.id })
    .from(attendances)
    .where(and(eq(attendances.userId, userId), eq(attendances.sessionId, sessionId)))
    .limit(1);
  return row.length > 0;
}

/** Taille lisible dans la langue de la page : 350 ko, 1,2 Mo / 350 kB, 1.2 MB. */
export function formatFileSize(bytes: number, locale: string): string {
  const mb = bytes >= 1024 * 1024;
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: mb ? "megabyte" : "kilobyte",
    unitDisplay: "short",
    maximumFractionDigits: 1,
  }).format(mb ? bytes / (1024 * 1024) : Math.max(1, Math.round(bytes / 1024)));
}
