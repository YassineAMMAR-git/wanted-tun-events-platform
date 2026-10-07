import { redirect } from "next/navigation";
import { respondToAttendance } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

/**
 * Réponse directe depuis l'e-mail de rappel :
 * /api/rappel/<token>?reponse=confirme  ou  ?reponse=absent
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const raw = new URL(request.url).searchParams.get("reponse");
  const response = raw === "absent" ? "declined" : raw === "confirme" ? "confirmed" : null;
  if (!response) redirect(`/rappel/${token}`);

  const result = await respondToAttendance({ token }, response, "email");
  if (result === "closed") redirect(`/rappel/${token}?erreur=cloture`);
  if (result === "invalid") redirect(`/rappel/${token}?erreur=1`);
  redirect(`/rappel/${token}?fait=${response === "confirmed" ? "confirme" : "absent"}`);
}
