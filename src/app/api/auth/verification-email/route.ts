import { NextResponse, type NextRequest } from "next/server";
import { verifyEmailToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Lien du bouton « Confirmer mon compte » reçu par e-mail. */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const result = await verifyEmailToken(token);

  const target = new URL("/connexion", request.nextUrl.origin);
  target.searchParams.set("verification", result);

  const response = NextResponse.redirect(target, 303);
  // Le jeton figure dans l'URL : il ne doit pas être transmis aux sites tiers ni mis en cache.
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Cache-Control", "no-store");
  return response;
}
