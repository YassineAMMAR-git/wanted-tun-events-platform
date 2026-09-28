import { after } from "next/server";
import { verifyWebhookSignature } from "@/lib/qonto/client";
import { handlePaymentLinkEvent } from "@/lib/qonto/payments";

export const dynamic = "force-dynamic";

/**
 * Webhook Qonto « v1/payment-links ».
 * Qonto attend une réponse 2xx en moins d'une seconde et réessaie sinon pendant plusieurs jours :
 * on vérifie la signature, on répond tout de suite, et le traitement se fait après la réponse.
 * Le statut n'est jamais pris dans le message : il est relu chez Qonto avant toute activation.
 */
export async function POST(request: Request) {
  const raw = await request.text();

  let valid = false;
  try {
    valid = await verifyWebhookSignature(raw, request.headers.get("x-qonto-signature"));
  } catch (error) {
    console.error("[qonto] vérification du webhook impossible", error);
    return Response.json({ ok: false }, { status: 500 });
  }
  if (!valid) return Response.json({ ok: false, error: "invalid signature" }, { status: 401 });

  let linkId: string | undefined;
  try {
    const payload = JSON.parse(raw) as { type?: string; data?: { payment_link_id?: string } };
    if (payload.type === "v1/payment-links") linkId = payload.data?.payment_link_id;
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  if (linkId) {
    const id = linkId;
    after(async () => {
      try {
        await handlePaymentLinkEvent(id);
      } catch (error) {
        // La tâche quotidienne et la page de paiement rattraperont ce lien.
        console.error("[qonto] traitement du webhook impossible", error);
      }
    });
  }
  return Response.json({ ok: true });
}
