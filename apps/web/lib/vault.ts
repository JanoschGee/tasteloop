import { openReader, type Reader } from "@tasteloop/core/read";

/** Reads the brand config from TASTELOOP_BRAND_CONFIG. Server-side only. */
export function reader(): Reader {
  const p = process.env.TASTELOOP_BRAND_CONFIG;
  if (!p) throw new Error("TASTELOOP_BRAND_CONFIG is not set (path to your brand config).");
  return openReader(p);
}

export function imageUrl(vaultPath: string): string {
  return `/api/image/${vaultPath.split("/").map(encodeURIComponent).join("/")}`;
}

export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d))?/.exec(iso);
  if (!m) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}${m[4] ? `, ${m[4]}:${m[5]}` : ""}`;
}
