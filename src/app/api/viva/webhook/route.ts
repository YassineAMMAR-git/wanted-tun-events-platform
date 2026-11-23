import { getWebhookKey, readOrderCode } from "@/lib/viva/client";
import { handlePaymentWebhook } from "@/lib/viva/payments";

export const dynamic = "force-dynamic";

/** Événements déclarés dans l'espace Viva : Transaction Payment Created et Transaction Failed. */
const PAYMENT_CREATED = 1796;

/**
 * Vérification de l'adresse par Viva, à l'enregistrement du webhook :
 * elle attend la clé du compte, obtenue avec l'identifiant marchand et la clé d'API.
 */
export async function GET() {
  try {
    return Response.json({ Key: await getWebhookKey() });
  } catch (error) {
    console.error("[viva] clé du webhook introuvable", error);
    return new Response(null, { status: 500 });
  }
}

/**
 * Webhook Viva : appelé à chaque transaction, avec le code de commande et l'identifiant de la transaction.
 * Le message n'est pas signé : il ne sert que de signal, la transaction est toujours relue chez Viva.
 * Une réponse autre que 200 fait réessayer Viva plus tard ; une commande inconnue reçoit 200 sans rien révéler.
 */
export async function POST(request: Request) {
  let text = "";
  let event: { EventTypeId?: number; EventData?: { TransactionId?: string } } = {};
  try {
    text = await request.text();
    event = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const orderCode = readOrderCode(text, "OrderCode");
  if (!orderCode) return new Response(null, { status: 200 });

  // Un échec n'est pas définitif (le client peut retenter sur la même page) : seule une réussite est signalée
  // comme transaction ; pour un échec, la commande est simplement relue.
  const transactionId = event.EventTypeId === PAYMENT_CREATED ? (event.EventData?.TransactionId ?? null) : null;
  try {
    await handlePaymentWebhook(orderCode, transactionId);
  } catch (error) {
    console.error("[viva] traitement du webhook impossible", error);
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 200 });
}
