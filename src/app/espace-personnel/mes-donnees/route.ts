import { getCurrentUser } from "@/lib/auth";
import { exportUserData } from "@/lib/privacy";

export const dynamic = "force-dynamic";

/**
 * « Télécharger mes données » : droit d'accès et à la portabilité (RGPD art. 15 et 20).
 * Fichier JSON avec toutes les données personnelles du compte connecté, et seulement les siennes.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });

  const data = await exportUserData(user.id);
  if (!data) return new Response(null, { status: 404 });

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="mes-donnees-wanted-tun-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
