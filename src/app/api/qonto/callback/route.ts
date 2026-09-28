import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { connectWithCode, registerWebhook } from "@/lib/qonto/client";
import { appUrl, qontoWebhookUrl } from "@/lib/qonto/config";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "qonto_oauth_state";

const back = (kind: "ok" | "erreur", message: string) =>
  NextResponse.redirect(`${appUrl()}/admin/paiements?${kind}=${encodeURIComponent(message)}`);

/** Retour de Qonto après autorisation : échange du code, puis abonnement du site au webhook. */
export async function GET(request: NextRequest) {
  await requireAdmin();
  const params = request.nextUrl.searchParams;
  const expected = request.cookies.get(STATE_COOKIE)?.value ?? "";
  const received = params.get("state") ?? "";

  const sameState =
    expected.length > 0 &&
    expected.length === received.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(received));

  let response: NextResponse;
  if (params.get("error")) {
    response = back("erreur", "qontoDenied");
  } else if (!sameState || !params.get("code")) {
    response = back("erreur", "qontoState");
  } else {
    try {
      await connectWithCode(params.get("code")!);
      try {
        await registerWebhook(qontoWebhookUrl());
        response = back("ok", "qontoConnected");
      } catch (error) {
        console.error("[qonto] abonnement au webhook impossible", error);
        response = back("erreur", "qontoWebhookFailed");
      }
    } catch (error) {
      console.error("[qonto] connexion impossible", error);
      response = back("erreur", "qontoConnectFailed");
    }
  }

  response.cookies.delete({ name: STATE_COOKIE, path: "/api/qonto" });
  return response;
}
