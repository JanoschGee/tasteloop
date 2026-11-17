import { readImage } from "@tasteloop/core/read";
import { reader } from "@/lib/vault";

/** Serves images from Tasteloop's folder in the vault (read-only, nothing outside it). */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const img = readImage(reader(), path.map((p) => decodeURIComponent(p)).join("/"));
  if (!img) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(img.data), {
    headers: { "content-type": img.type, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" },
  });
}
