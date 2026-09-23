import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Sonde de disponibilité : vérifie que la base répond.
 *
 * Réponse publique : `{ ok }` plus le code d'erreur du pilote (ECONNREFUSED,
 * ENOTFOUND, 28P01 « mot de passe refusé »…), sans rien révéler de la connexion.
 *
 * Diagnostic : `?debug=$CRON_SECRET` ajoute le message d'erreur complet, utile
 * pour une mise en ligne qui échoue. Réservé au porteur du secret, car le message
 * peut contenir l'hôte ou l'utilisateur de la base.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const debug = Boolean(secret) && new URL(request.url).searchParams.get("debug") === secret;

  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch (error) {
    const { code, name, message } = (error ?? {}) as { code?: string; name?: string; message?: string };
    console.error("[health] base injoignable", error);
    return Response.json(
      {
        ok: false,
        code: code ?? name ?? "unknown",
        ...(debug ? { message, hasDatabaseUrl: Boolean(process.env.DATABASE_URL) } : {}),
      },
      { status: 500 },
    );
  }
}
