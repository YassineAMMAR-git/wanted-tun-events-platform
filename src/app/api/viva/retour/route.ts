import { appUrl } from "@/lib/viva/config";
import { handlePaymentReturn } from "@/lib/viva/payments";

export const dynamic = "force-dynamic";

/**
 * Retour du client après la page de paiement Viva : URL de succès et d'échec de la source de paiement
 * (Viva n'accepte pas d'adresse de retour propre à chaque commande). Viva ajoute s = code de commande
 * et t = transaction ; le résultat est relu chez Viva puis le client retrouve la page de paiement du site.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const subscriptionId = await handlePaymentReturn(params.get("s") ?? "", params.get("t"));
  const target = subscriptionId ? `/abonnement/${subscriptionId}/paiement?retour=1` : "/espace-personnel";
  return Response.redirect(`${appUrl()}${target}`, 303);
}
