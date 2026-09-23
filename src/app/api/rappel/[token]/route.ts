import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { activities, attendances, sessions } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * Réponse directe depuis l'e-mail de rappel :
 * /api/rappel/<token>?reponse=confirme  ou  ?reponse=absent
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const url = new URL(request.url);
  const raw = url.searchParams.get("reponse");
  const response = raw === "absent" ? "declined" : raw === "confirme" ? "confirmed" : null;

  if (!response) redirect(`/rappel/${token}`);

  const attendance = (
    await db
      .select({ id: attendances.id })
      .from(attendances)
      .innerJoin(sessions, eq(sessions.id, attendances.sessionId))
      .innerJoin(activities, eq(activities.id, sessions.activityId))
      .where(and(eq(attendances.token, token), eq(sessions.status, "scheduled")))
      .limit(1)
  )[0];

  if (!attendance) {
    redirect(`/rappel/${token}?erreur=1`);
  }

  await db
    .update(attendances)
    .set({ status: response, respondedAt: new Date(), responseChannel: "email" })
    .where(eq(attendances.id, attendance.id));

  redirect(`/rappel/${token}?fait=${response === "confirmed" ? "confirme" : "absent"}`);
}
