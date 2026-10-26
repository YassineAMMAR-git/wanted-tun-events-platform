import { getCurrentUser } from "@/lib/auth";
import { getSessionDocument, isEnrolled } from "@/lib/session-documents";

export const dynamic = "force-dynamic";

/**
 * Téléchargement d'un PDF de séance : réservé aux clients inscrits à la séance et à l'administration.
 * Jamais mis en cache par un intermédiaire, puisque l'accès dépend de la personne connectée.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response(null, { status: 404 });

  const user = await getCurrentUser();
  if (!user) {
    const login = new URL("/connexion", request.url);
    login.searchParams.set("next", `/documents/${id}`);
    return Response.redirect(login, 303);
  }

  const doc = await getSessionDocument(id);
  if (!doc || (user.role !== "admin" && !(await isEnrolled(user.id, doc.sessionId)))) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const asciiName = doc.fileName.replace(/[^\x20-\x7e]/g, "_");
  return new Response(new Uint8Array(doc.data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(doc.size),
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
