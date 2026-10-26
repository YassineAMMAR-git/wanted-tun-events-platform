import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { cleanFileName, isPdf, MAX_DOCUMENT_BYTES, saveSessionDocument } from "@/lib/session-documents";

export const dynamic = "force-dynamic";

/**
 * Envoi d'un PDF depuis la fiche séance de l'administration (formulaire classique, sans JavaScript requis).
 * Revient ensuite sur la fiche séance avec un message de confirmation ou d'erreur.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") return new Response(null, { status: 403 });

  // Requête venue d'une autre origine : refusée (le cookie de session est déjà en SameSite=Lax).
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) return new Response(null, { status: 403 });

  const sessionId = Number((await params).id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) return new Response(null, { status: 404 });
  const back = (kind: "ok" | "erreur", key: string) =>
    new Response(null, {
      status: 303,
      headers: { Location: `/admin/seances/${sessionId}?${kind}=${key}#documents` },
    });

  const exists = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (exists.length === 0) return new Response(null, { status: 404 });

  let file: FormDataEntryValue | null = null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return back("erreur", "documentInvalid");
  }
  if (!(file instanceof File) || file.size === 0) return back("erreur", "documentInvalid");
  if (file.size > MAX_DOCUMENT_BYTES) return back("erreur", "documentTooLarge");

  const data = Buffer.from(await file.arrayBuffer());
  if (!isPdf(data)) return back("erreur", "documentNotPdf");

  try {
    await saveSessionDocument(sessionId, cleanFileName(file.name), data);
  } catch (error) {
    console.error("[documents] enregistrement impossible", error);
    return back("erreur", "documentUnavailable");
  }
  return back("ok", "documentAdded");
}
