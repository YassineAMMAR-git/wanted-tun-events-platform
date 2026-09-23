import { runReminderJob } from "@/lib/reminders";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * Tâche planifiée : rappels automatiques J-2 (48 h avant chaque séance)
 * + expiration des abonnements arrivés à échéance.
 *
 * À appeler par un cron (par exemple toutes les heures) :
 *   curl -H "x-cron-secret: $CRON_SECRET" https://…/api/cron/reminders
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided =
      request.headers.get("x-cron-secret") ?? request.headers.get("authorization")?.replace("Bearer ", "");
    if (provided !== secret) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  await ensureSeeded();

  try {
    const result = await runReminderJob();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
