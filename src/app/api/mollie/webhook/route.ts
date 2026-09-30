import { handlePaymentWebhook } from "@/lib/mollie/payments";

export const dynamic = "force-dynamic";

/**
 * Webhook Mollie : appelé à chaque changement de statut d'un paiement, avec seulement son identifiant (id=tr_…).
 * Le message n'est pas signé : il ne sert que de signal, le statut est toujours relu chez Mollie avec la clé d'API.
 * Une réponse autre que 200 fait réessayer Mollie plus tard ; un identifiant inconnu reçoit 200 sans rien révéler.
 */
export async function POST(request: Request) {
  let id = "";
  try {
    id = String((await request.formData()).get("id") ?? "");
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!/^tr_\w+$/.test(id)) return new Response(null, { status: 200 });

  try {
    await handlePaymentWebhook(id);
  } catch (error) {
    console.error("[mollie] traitement du webhook impossible", error);
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 200 });
}
