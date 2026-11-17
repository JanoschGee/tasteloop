/**
 * Brand Guide als Baum von Abschnitten (Markdown-Überschriften).
 *
 * Sperre (alles zusammen ergibt den Kern):
 *  - Überschriften aus der Config (brand_guide.gesperrte_abschnitte)
 *  - Überschriften aus dem Frontmatter des Guides (Standard-Schlüssel "gesperrt")
 *  - Unterabschnitte erben die Sperre, der Titel (H1) und sein Vorspann sind gesperrt (praeambel_gesperrt)
 *  - Frontmatter: nur die freigegebenen Schlüssel (z. B. version, stand) darf das System ändern
 *  - gesperrte Tokens: Zeilen, die z. B. `color.base` enthalten, bleiben Zeichen für Zeichen gleich,
 *    auch wenn sie in einem lernenden Abschnitt stehen
 *  - Lernbereich: ist er gesetzt, darf nur dort (inkl. Unterabschnitte) geändert werden
 *
 * Harte Prüfung (assertGuideIntegrity): Zwischen alter und neuer Fassung darf sich außer dem
 * eigenen Text der erlaubten Abschnitte und den freien Frontmatter-Schlüsseln nichts geändert haben.
 * Jeder automatische Schreibzugriff auf den Guide muss durch diese Prüfung.
 */
import { createHash } from "node:crypto";
import { parse } from "yaml";

export interface Section {
  /** Überschrift ohne #, getrimmt */
  title: string;
  level: number;
  /** Pfad der Überschriften von oben, z. B. ["Guide", "2. Ausdruck", "2.1 Farbe"] */
  path: string[];
  headingLine: number;
  /** erste Zeile des eigenen Texts (nach der Überschrift) */
  bodyStart: number;
  /** Ende des eigenen Texts (exklusiv): nächste Überschrift beliebiger Ebene */
  bodyEnd: number;
  /** Ende inklusive Unterabschnitte (exklusiv) */
  end: number;
}

export interface ParsedGuide {
  lines: string[];
  sections: Section[];
  /** erste Zeile nach dem Frontmatter */
  frontmatterEnd: number;
  frontmatter: Record<string, unknown>;
  /** erste Überschrift der Ebene >= 2 */
  preambleEnd: number;
}

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

export function normTitle(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

export function parseGuide(text: string): ParsedGuide {
  const lines = text.split("\n");
  let start = 0;
  let frontmatter: Record<string, unknown> = {};
  if (lines[0] === "---") {
    const close = lines.indexOf("---", 1);
    if (close > 0) {
      start = close + 1;
      try {
        frontmatter = (parse(lines.slice(1, close).join("\n")) ?? {}) as Record<string, unknown>;
      } catch {
        frontmatter = {};
      }
    }
  }
  const heads: { line: number; level: number; title: string }[] = [];
  let fence = false;
  for (let i = start; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) fence = !fence;
    if (fence) continue;
    const m = HEADING.exec(lines[i]);
    if (m) heads.push({ line: i, level: m[1].length, title: m[2].trim() });
  }
  const sections: Section[] = [];
  const stack: Section[] = [];
  heads.forEach((h, idx) => {
    while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop();
    const next = heads[idx + 1];
    let end = lines.length;
    for (let j = idx + 1; j < heads.length; j++) {
      if (heads[j].level <= h.level) {
        end = heads[j].line;
        break;
      }
    }
    const s: Section = {
      title: h.title,
      level: h.level,
      path: [...stack.map((x) => x.title), h.title],
      headingLine: h.line,
      bodyStart: h.line + 1,
      bodyEnd: next ? next.line : lines.length,
      end,
    };
    sections.push(s);
    stack.push(s);
  });
  const firstSub = heads.find((h) => h.level >= 2);
  return { lines, sections, frontmatterEnd: start, frontmatter, preambleEnd: firstSub ? firstSub.line : lines.length };
}

export interface LockRules {
  gesperrte_abschnitte: string[];
  praeambel_gesperrt: boolean;
  /** Frontmatter-Schlüssel mit weiteren gesperrten Überschriften (Standard "gesperrt") */
  frontmatter_sperre?: string;
  /** nur diese Abschnitte (inkl. Unterabschnitte) dürfen sich ändern; leer = alle nicht gesperrten */
  lernbereich?: string[];
  /** Zeilen mit diesen Zeichenfolgen bleiben unverändert (z. B. Grundfarben-Tokens) */
  gesperrte_tokens?: string[];
  /** Frontmatter-Schlüssel, die das System ändern darf */
  frontmatter_frei?: string[];
}

function asStringList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v.trim()) return [v];
  return [];
}

/** Gesperrte Überschriften: Config plus Frontmatter des (alten) Guides. */
export function lockedTitles(g: ParsedGuide, rules: LockRules): string[] {
  const key = rules.frontmatter_sperre ?? "gesperrt";
  return [...rules.gesperrte_abschnitte, ...asStringList(g.frontmatter[key])];
}

export function isLocked(section: Section, rules: LockRules, g?: ParsedGuide): boolean {
  const titles = g ? lockedTitles(g, rules) : rules.gesperrte_abschnitte;
  const locked = new Set(titles.map(normTitle));
  if (section.path.some((t) => locked.has(normTitle(t)))) return true;
  if (rules.praeambel_gesperrt && section.level === 1) return true;
  return false;
}

/** Darf das System diesen Abschnitt (eigenen Text) ändern? */
export function isEditable(section: Section, rules: LockRules, g: ParsedGuide): boolean {
  if (section.level === 1) return false;
  if (isLocked(section, rules, g)) return false;
  const lern = (rules.lernbereich ?? []).map(normTitle);
  if (lern.length && !section.path.some((t) => lern.includes(normTitle(t)))) return false;
  return true;
}

export function findSection(g: ParsedGuide, ref: string): Section | undefined {
  const parts = ref.split(">").map(normTitle).filter(Boolean);
  const matches = g.sections.filter((s) => {
    const p = s.path.map(normTitle);
    if (parts.length === 1) return p[p.length - 1] === parts[0];
    return parts.every((x, i) => p[p.length - parts.length + i] === x);
  });
  return matches.length === 1 ? matches[0] : undefined;
}

export function sectionRef(s: Section): string {
  return s.path.filter((_, i) => !(i === 0 && s.path.length > 1 && s.level > 1)).join(" > ");
}

export function ownBody(g: ParsedGuide, s: Section): string {
  return g.lines.slice(s.bodyStart, s.bodyEnd).join("\n");
}

export function fullText(g: ParsedGuide, s: Section): string {
  return g.lines.slice(s.headingLine, s.end).join("\n");
}

export function hash(text: string): string {
  return createHash("sha256").update(text.replace(/\s+$/g, "")).digest("hex").slice(0, 16);
}

/** Schnappschuss aller gesperrten Teile (Präambel + gesperrte Abschnitte), Sperren aus der alten Fassung. */
export function lockedSnapshot(text: string, rules: LockRules, lockSource?: ParsedGuide): Map<string, string> {
  const g = parseGuide(text);
  const snap = new Map<string, string>();
  if (rules.praeambel_gesperrt) snap.set("(Präambel)", g.lines.slice(g.frontmatterEnd, g.preambleEnd).join("\n"));
  const locked = new Set(lockedTitles(lockSource ?? g, rules).map(normTitle));
  for (const s of g.sections) {
    if (locked.has(normTitle(s.title))) snap.set(s.path.join(" > "), fullText(g, s));
  }
  return snap;
}

export class LockedSectionError extends Error {
  constructor(public readonly sections: string[]) {
    super(`Gesperrte Kern-Teile dürfen nicht automatisch geändert werden: ${sections.join(", ")}`);
    this.name = "LockedSectionError";
  }
}

/** Gesperrte Abschnitte und Präambel müssen Zeichen für Zeichen gleich bleiben. */
export function assertLockedUnchanged(before: string, after: string, rules: LockRules): void {
  const gb = parseGuide(before);
  const a = lockedSnapshot(before, rules, gb);
  const b = lockedSnapshot(after, rules, gb);
  const changed: string[] = [];
  for (const [k, v] of a) if (b.get(k) !== v) changed.push(k);
  for (const k of b.keys()) if (!a.has(k)) changed.push(k);
  if (changed.length) throw new LockedSectionError(changed);
}

function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/**
 * Vollständige Prüfung einer automatischen Änderung.
 * erlaubt: Abschnitts-Referenzen, deren EIGENER Text sich ändern darf.
 */
export function assertGuideIntegrity(before: string, after: string, rules: LockRules, erlaubt: string[]): void {
  assertLockedUnchanged(before, after, rules);
  const gb = parseGuide(before);
  const ga = parseGuide(after);

  // Frontmatter: nur freie Schlüssel dürfen sich ändern
  const frei = new Set(rules.frontmatter_frei ?? []);
  const strip = (fm: Record<string, unknown>) => Object.fromEntries(Object.entries(fm).filter(([k]) => !frei.has(k)));
  if (stableJson(strip(gb.frontmatter)) !== stableJson(strip(ga.frontmatter))) {
    throw new LockedSectionError(["(Frontmatter)"]);
  }
  if ((gb.frontmatterEnd === 0) !== (ga.frontmatterEnd === 0)) throw new LockedSectionError(["(Frontmatter)"]);

  // Gesperrte Tokens: alle Zeilen mit dem Token bleiben gleich
  for (const t of rules.gesperrte_tokens ?? []) {
    const la = gb.lines.filter((l) => l.includes(t)).join("\n");
    const lb = ga.lines.filter((l) => l.includes(t)).join("\n");
    if (la !== lb) throw new LockedSectionError([`Token ${t}`]);
  }

  // Struktur gleich, und außerhalb der erlaubten eigenen Texte kein Zeichen anders
  const mask = (g: ParsedGuide) => {
    const out = g.lines.slice(g.frontmatterEnd);
    const offset = g.frontmatterEnd;
    const allowed = erlaubt.map((r) => findSection(g, r)).filter((s): s is Section => !!s);
    if (allowed.length !== erlaubt.length) throw new ChangeError(`Erlaubter Abschnitt nicht eindeutig gefunden: ${erlaubt.join(", ")}`);
    // von hinten ersetzen, damit Indizes stimmen
    for (const s of [...allowed].sort((x, y) => y.bodyStart - x.bodyStart)) {
      out.splice(s.bodyStart - offset, s.bodyEnd - s.bodyStart, `<<frei:${normTitle(sectionRef(s))}>>`);
    }
    return out.join("\n");
  };
  const mb = mask(gb);
  const ma = mask(ga);
  if (mb !== ma) {
    const la = mb.split("\n");
    const lb = ma.split("\n");
    let i = 0;
    while (i < la.length && la[i] === lb[i]) i++;
    throw new LockedSectionError([`Änderung außerhalb der erlaubten Abschnitte (bei „${(la[i] ?? lb[i] ?? "").slice(0, 60)}“)`]);
  }
}

/** Konfigurierte Sperren und Lernbereiche, die es im Guide nicht gibt (Tippfehler in der Config). */
export function missingLocks(text: string, rules: LockRules): string[] {
  const g = parseGuide(text);
  const titles = new Set(g.sections.map((s) => normTitle(s.title)));
  return [...lockedTitles(g, rules), ...(rules.lernbereich ?? [])].filter((t) => !titles.has(normTitle(t)));
}

export interface Change {
  abschnitt: string;
  art: "ersetzen" | "ergaenzen";
  text: string;
}

export class ChangeError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ChangeError";
  }
}

function trimmed(xs: string[]) {
  let a = 0;
  let b = xs.length;
  while (a < b && xs[a].trim() === "") a++;
  while (b > a && xs[b - 1].trim() === "") b--;
  return xs.slice(a, b);
}

/** Ersetzt den eigenen Text eines Abschnitts (ohne Prüfung). */
export function replaceOwnBody(text: string, s: Section, body: string[]): string {
  const g = parseGuide(text);
  const head = g.lines.slice(0, s.bodyStart);
  const rest = g.lines.slice(s.bodyEnd);
  return (rest.length ? [...head, "", ...body, "", ...rest] : [...head, "", ...body, ""]).join("\n");
}

/**
 * Wendet eine Änderung auf den eigenen Text eines Abschnitts an
 * (Überschrift und Unterabschnitte bleiben unberührt) und prüft danach hart.
 */
export function applyChange(text: string, change: Change, rules: LockRules): string {
  const g = parseGuide(text);
  const s = findSection(g, change.abschnitt);
  if (!s) throw new ChangeError(`Abschnitt nicht eindeutig gefunden: "${change.abschnitt}"`);
  if (isLocked(s, rules, g)) throw new LockedSectionError([s.path.join(" > ")]);
  if (!isEditable(s, rules, g)) throw new LockedSectionError([`${s.path.join(" > ")} (außerhalb des Lernbereichs)`]);
  if (/^#{1,6}\s/m.test(change.text)) {
    throw new ChangeError("Neuer Text darf keine Überschriften enthalten (Struktur des Guides bleibt menschlich)");
  }
  const newText = trimmed(change.text.split("\n"));
  if (newText.length === 0) throw new ChangeError("Neuer Text ist leer");
  const core = trimmed(g.lines.slice(s.bodyStart, s.bodyEnd));
  const body = change.art === "ersetzen" ? newText : core.length ? [...core, "", ...newText] : newText;
  const out = replaceOwnBody(text, s, body);
  assertGuideIntegrity(text, out, rules, [sectionRef(s)]);
  return out;
}

// ---------------------------------------------------------------------------
// Änderungsprotokoll und Version im Guide
// ---------------------------------------------------------------------------

export interface ProtokollEintrag {
  datum: string;
  teil: string;
  aenderung: string;
  beleg: string;
  freigabe: string;
}

function cell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ").trim() || "–";
}

/** Hängt eine Zeile an die erste Tabelle im Protokoll-Abschnitt an (Spalten nach Kopfzeile). */
export function appendProtocolRow(text: string, abschnitt: string, e: ProtokollEintrag): string {
  const g = parseGuide(text);
  const s = findSection(g, abschnitt);
  if (!s) throw new ChangeError(`Protokoll-Abschnitt nicht gefunden: "${abschnitt}"`);
  const own = g.lines.slice(s.bodyStart, s.bodyEnd);
  const firstTable = own.findIndex((l) => l.trim().startsWith("|"));
  const values: Record<string, string> = {
    datum: e.datum,
    teil: e.teil,
    abschnitt: e.teil,
    "änderung": e.aenderung,
    aenderung: e.aenderung,
    beleg: e.beleg,
    belege: e.beleg,
    freigabe: e.freigabe,
    // englische Kopfzeilen (Vorlage templates/brand-guide.md)
    date: e.datum,
    part: e.teil,
    section: e.teil,
    change: e.aenderung,
    evidence: e.beleg,
    "approved by": e.freigabe,
    approval: e.freigabe,
  };
  let body: string[];
  if (firstTable < 0) {
    body = [...trimmed(own), ...(trimmed(own).length ? [""] : []), "| Datum | Teil | Änderung | Beleg | Freigabe |", "|---|---|---|---|---|", `| ${[e.datum, e.teil, e.aenderung, e.beleg, e.freigabe].map(cell).join(" | ")} |`];
  } else {
    let last = firstTable;
    while (last + 1 < own.length && own[last + 1].trim().startsWith("|")) last++;
    const header = own[firstTable].split("|").slice(1, -1).map((h) => normTitle(h));
    const row = `| ${header.map((h) => cell(values[h] ?? "")).join(" | ")} |`;
    body = trimmed([...own.slice(0, last + 1), row, ...own.slice(last + 1)]);
  }
  return replaceOwnBody(text, s, body);
}

/** Erhöht die Versionsnummer und setzt das Datum im Frontmatter, ohne die übrige Formatierung anzufassen. */
export function bumpFrontmatter(text: string, versionKey: string | undefined, datumKey: string | undefined, datum: string): string {
  const g = parseGuide(text);
  if (g.frontmatterEnd === 0) return text;
  const lines = [...g.lines];
  for (let i = 1; i < g.frontmatterEnd - 1; i++) {
    if (versionKey) {
      const m = new RegExp(`^${versionKey}:\\s*(\\d+)\\s*$`).exec(lines[i]);
      if (m) lines[i] = `${versionKey}: ${Number(m[1]) + 1}`;
    }
    if (datumKey && new RegExp(`^${datumKey}:`).test(lines[i])) lines[i] = `${datumKey}: ${datum}`;
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Tabellen (z. B. Prompt-Bausteine)
// ---------------------------------------------------------------------------

/** Liest die erste Markdown-Tabelle eines Textes: Zeilen als Objekte nach Kopfzeile. */
export function parseTable(text: string): { header: string[]; rows: string[][] } | undefined {
  const lines = text.split("\n").filter((l) => l.trim().startsWith("|"));
  if (lines.length < 2) return undefined;
  const split = (l: string) =>
    l
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split(/(?<!\\)\|/)
      .map((c) => c.trim());
  const header = split(lines[0]);
  const rows = lines.slice(2).map(split);
  return { header, rows };
}

export function stripMd(s: string): string {
  return s.replace(/\*\*/g, "").replace(/^`|`$/g, "").trim();
}
