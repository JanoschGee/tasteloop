import { openReader, type Reader } from "@tasteloop/core/read";

/** Liest die Marken-Config aus TASTELOOP_BRAND_CONFIG. Nur serverseitig benutzen. */
export function reader(): Reader {
  const p = process.env.TASTELOOP_BRAND_CONFIG;
  if (!p) throw new Error("TASTELOOP_BRAND_CONFIG ist nicht gesetzt (Pfad zu brands/<marke>.yaml).");
  return openReader(p);
}

export function imageUrl(vaultPath: string): string {
  return `/api/bild/${vaultPath.split("/").map(encodeURIComponent).join("/")}`;
}

export function formatDatum(iso: string): string {
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d))?/.exec(iso);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}${m[4] ? `, ${m[4]}:${m[5]}` : ""}`;
}
