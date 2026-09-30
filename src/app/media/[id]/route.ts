import { getImage } from "@/lib/media";

/**
 * Photo envoyée depuis l'administration. Une photo n'est jamais modifiée (une nouvelle photo = un nouvel identifiant) :
 * elle est donc mise en cache un an par le navigateur et par le CDN de Vercel, la base n'est lue qu'une fois.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response(null, { status: 404 });

  const image = await getImage(id);
  if (!image) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

  return new Response(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.contentType,
      "Content-Length": String(image.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
