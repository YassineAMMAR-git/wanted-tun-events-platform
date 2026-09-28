import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { QONTO_SCOPES, appUrl, qontoConfigured, qontoRedirectUri, qontoUrls } from "@/lib/qonto/config";

export const dynamic = "force-dynamic";

const QONTO_STATE_COOKIE = "qonto_oauth_state";

/**
 * Début de la connexion Qonto : l'administrateur est envoyé sur la page d'autorisation Qonto.
 * Le paramètre `state` (aléatoire, gardé en cookie) protège le retour contre la falsification.
 */
export async function GET() {
  await requireAdmin();
  if (!qontoConfigured()) {
    return NextResponse.redirect(`${appUrl()}/admin/paiements?erreur=qontoNotConfigured`);
  }

  const state = randomBytes(24).toString("hex");
  const url = new URL(qontoUrls().authorize);
  url.search = new URLSearchParams({
    client_id: process.env.QONTO_CLIENT_ID ?? "",
    redirect_uri: qontoRedirectUri(),
    response_type: "code",
    scope: QONTO_SCOPES.join(" "),
    state,
  }).toString();

  const response = NextResponse.redirect(url);
  response.cookies.set(QONTO_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/qonto",
    maxAge: 600,
  });
  return response;
}
