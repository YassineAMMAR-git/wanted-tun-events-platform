import { runReminderJob } from "@/lib/reminders";
import { ensureSeeded } from "@/lib/seed";
import { reconcilePendingPayments } from "@/lib/mollie/payments";
import { deleteOrphanImages } from "@/lib/media";
import { purgeExpiredPersonalData } from "@/lib/privacy";
import { secretsMatch } from "@/lib/auth/tokens";

export const dynamic = "force-dynamic";

/**
 * Tâche planifiée : rappels automatiques J-2 (48 h avant chaque séance)
 * + expiration des abonnements arrivés à échéance
 * + filet de sécurité des paiements Mollie (paiements payés dont le webhook aurait été manqué)
 * + suppression des photos qui ne sont plus utilisées.
 *
 * À appeler par un cron (par exemple toutes les heures) :
 *   curl -H "x-cron-secret: $CRON_SECRET" https://…/api/cron/reminders
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  // En production, sans secret configuré la route reste fermée : elle envoie des e-mails et modifie des données.
  if (!secret && process.env.NODE_ENV === "production") {
    return Response.json({ ok: false, error: "CRON_SECRET manquant" }, { status: 503 });
  }
  if (secret) {
    const provided =
      request.headers.get("x-cron-secret") ?? request.headers.get("authorization")?.replace("Bearer ", "");
    if (!secretsMatch(provided, secret)) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  await ensureSeeded();

  try {
    const result = await runReminderJob();
    const payments = await reconcilePendingPayments();
    const imagesDeleted = await deleteOrphanImages().catch((error) => {
      console.error("[media] nettoyage impossible", error);
      return 0;
    });
    // Durées de conservation des données personnelles (RGPD art. 5 § 1 e).
    const purged = await purgeExpiredPersonalData().catch((error) => {
      console.error("[privacy] purge impossible", error);
      return null;
    });
    return Response.json({ ok: true, ...result, payments, imagesDeleted, purged });
  } catch (error) {
    console.error("[cron] échec", error);
    return Response.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
