import { getImage, isImagePath } from "@/lib/image-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const YEAR = 31536000;

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const imagePath = (await params).path.join("/");
  if (!isImagePath(imagePath)) return new Response("Not found", { status: 404 });

  const started = Date.now();
  try {
    const image = await getImage(imagePath);
    if (!image) {
      return new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=3600" } });
    }
    return new Response(new Uint8Array(image.body), {
      headers: {
        "Content-Type": image.contentType,
        "Content-Length": String(image.body.length),
        "Cache-Control": `public, max-age=${YEAR}, immutable`,
        // The share-card canvas draws posters and needs CORS to export them.
        "Access-Control-Allow-Origin": "*",
        "X-Image-Source": image.source,
        "X-Image-Ms": String(Date.now() - started),
      },
    });
  } catch {
    return new Response("Upstream unavailable", { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
