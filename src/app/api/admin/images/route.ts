import { getCurrentUser } from "@/lib/auth";
import { MAX_IMAGE_BYTES, saveImage, sniffImageType } from "@/lib/media";

export const dynamic = "force-dynamic";

/**
 * Envoi d'une photo depuis l'administration (champ « photo » des activités et du carrousel).
 * Répond { url: "/media/12" } : c'est cette adresse que le formulaire enregistre ensuite.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") return Response.json({ error: "forbidden" }, { status: 403 });

  // Requête venue d'une autre origine : refusée (le cookie de session est déjà en SameSite=Lax).
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  let file: FormDataEntryValue | null = null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  if (!(file instanceof File)) return Response.json({ error: "invalid" }, { status: 400 });
  if (file.size > MAX_IMAGE_BYTES) return Response.json({ error: "tooLarge" }, { status: 413 });

  const data = Buffer.from(await file.arrayBuffer());
  const contentType = sniffImageType(data);
  if (!contentType) return Response.json({ error: "type" }, { status: 415 });

  return Response.json({ url: await saveImage(data, contentType) });
}
