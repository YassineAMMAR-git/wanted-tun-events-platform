import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Sonde de disponibilité : vérifie que la base répond.
 * En cas d'échec, renvoie le code d'erreur du pilote (ECONNREFUSED, ENOTFOUND,
 * 28P01 « mot de passe refusé », 3D000 « base inconnue »…) afin de diagnostiquer
 * une mise en ligne sans avoir à fouiller les journaux. Le code seul est exposé :
 * ni l'hôte, ni l'utilisateur, ni la requête.
 */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch (error) {
    const { code, name } = (error ?? {}) as { code?: string; name?: string };
    console.error("[health] base injoignable", error);
    return Response.json({ ok: false, code: code ?? name ?? "unknown" }, { status: 500 });
  }
}
