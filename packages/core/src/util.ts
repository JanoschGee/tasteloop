import { randomBytes } from "node:crypto";

/** Lokale Zeit als "YYYY-MM-DDTHH:mm:ss" (ohne Zeitzone, so wie Obsidian datetime-Properties). */
export function localIso(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function localDate(d: Date = new Date()): string {
  return localIso(d).slice(0, 10);
}

/** Upload-ID: 20261112-1530-a1b2 (sortierbar, kurz, eindeutig genug) */
export function newUploadId(d: Date = new Date(), rnd: () => string = () => randomBytes(2).toString("hex")): string {
  const iso = localIso(d);
  return `${iso.slice(0, 10).replace(/-/g, "")}-${iso.slice(11, 16).replace(":", "")}-${rnd()}`;
}

/** Für Dateinamen: unzulässige Zeichen entfernen, kürzen. */
export function slug(s: string, max = 60): string {
  return s
    .replace(/[\\/:*?"<>|#^[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

export function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

export function wikilink(path: string): string {
  return `[[${path}]]`;
}

/** "[[a/b.jpg]]" oder "[[a/b|Titel]]" -> "a/b.jpg" */
export function unwikilink(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const m = /^!?\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]$/.exec(v.trim());
  return m ? m[1] : v;
}
