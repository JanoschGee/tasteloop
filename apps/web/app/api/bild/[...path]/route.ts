import { readImage } from "@tasteloop/core/read";
import { reader } from "@/lib/vault";

/** Liefert Bilder aus dem Brand-Ordner des Vaults (nur lesend, kein Pfad außerhalb). */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const img = readImage(reader(), path.map((p) => decodeURIComponent(p)).join("/"));
  if (!img) return new Response("Nicht gefunden", { status: 404 });
  return new Response(new Uint8Array(img.data), {
    headers: { "content-type": img.type, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" },
  });
}
