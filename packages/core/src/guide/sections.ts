/**
 * The brand guide as a tree of sections (Markdown headings).
 *
 * Lock (together this is the core):
 *  - headings from the config (guide.locked)
 *  - headings from the guide's frontmatter (key guide.locked_key, "locked" by default)
 *  - subsections inherit the lock; the title (H1) and its intro are locked (preamble_locked)
 *  - frontmatter: the system may only change the free keys (version, updated)
 *  - locked tokens: lines containing e.g. `color.base` stay identical, even inside a learning section
 *  - learning area: if set, changes only land there (including subsections)
 *
 * Hard check (assertGuideIntegrity): between the old and the new version nothing may differ except
 * the own text of the allowed sections and the free frontmatter keys. Every automatic write to the
 * guide must pass this check.
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
  locked: string[];
  preamble_locked: boolean;
  /** frontmatter key with more locked headings (default "locked") */
  locked_key?: string;
  /** only these sections (and subsections) may change; empty = all unlocked */
  learning?: string[];
  /** lines containing these strings stay unchanged (e.g. base colour tokens) */
  locked_tokens?: string[];
  /** frontmatter keys the system may change */
  free_keys?: string[];
}

function asStringList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v.trim()) return [v];
  return [];
}

/** Locked headings: config plus the frontmatter of the (old) guide. */
export function lockedTitles(g: ParsedGuide, rules: LockRules): string[] {
  const key = rules.locked_key ?? "locked";
  return [...rules.locked, ...asStringList(g.frontmatter[key])];
}

export function isLocked(section: Section, rules: LockRules, g?: ParsedGuide): boolean {
  const titles = g ? lockedTitles(g, rules) : rules.locked;
  const locked = new Set(titles.map(normTitle));
  if (section.path.some((t) => locked.has(normTitle(t)))) return true;
  if (rules.preamble_locked && section.level === 1) return true;
  return false;
}

/** May the system change this section's own text? */
export function isEditable(section: Section, rules: LockRules, g: ParsedGuide): boolean {
  if (section.level === 1) return false;
  if (isLocked(section, rules, g)) return false;
  const lern = (rules.learning ?? []).map(normTitle);
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

/** Snapshot of all locked parts (preamble + locked sections), locks taken from the old version. */
export function lockedSnapshot(text: string, rules: LockRules, lockSource?: ParsedGuide): Map<string, string> {
  const g = parseGuide(text);
  const snap = new Map<string, string>();
  if (rules.preamble_locked) snap.set("(preamble)", g.lines.slice(g.frontmatterEnd, g.preambleEnd).join("\n"));
  const locked = new Set(lockedTitles(lockSource ?? g, rules).map(normTitle));
  for (const s of g.sections) {
    if (locked.has(normTitle(s.title))) snap.set(s.path.join(" > "), fullText(g, s));
  }
  return snap;
}

export class LockedSectionError extends Error {
  constructor(public readonly sections: string[]) {
    super(`Locked core parts are never changed automatically: ${sections.join(", ")}`);
    this.name = "LockedSectionError";
  }
}

/** Locked sections and the preamble must stay identical, character by character. */
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
 * Full check of an automatic change.
 * allowed: section references whose OWN text may change.
 */
export function assertGuideIntegrity(before: string, after: string, rules: LockRules, allowed: string[]): void {
  assertLockedUnchanged(before, after, rules);
  const gb = parseGuide(before);
  const ga = parseGuide(after);

  // frontmatter: only free keys may change
  const frei = new Set(rules.free_keys ?? []);
  const strip = (fm: Record<string, unknown>) => Object.fromEntries(Object.entries(fm).filter(([k]) => !frei.has(k)));
  if (stableJson(strip(gb.frontmatter)) !== stableJson(strip(ga.frontmatter))) {
    throw new LockedSectionError(["(Frontmatter)"]);
  }
  if ((gb.frontmatterEnd === 0) !== (ga.frontmatterEnd === 0)) throw new LockedSectionError(["(Frontmatter)"]);

  // locked tokens: every line with the token stays the same
  for (const t of rules.locked_tokens ?? []) {
    const la = gb.lines.filter((l) => l.includes(t)).join("\n");
    const lb = ga.lines.filter((l) => l.includes(t)).join("\n");
    if (la !== lb) throw new LockedSectionError([`Token ${t}`]);
  }

  // same structure, and not a single character different outside the allowed own texts
  const mask = (g: ParsedGuide) => {
    const out = g.lines.slice(g.frontmatterEnd);
    const offset = g.frontmatterEnd;
    const secs = allowed.map((r) => findSection(g, r)).filter((s): s is Section => !!s);
    if (secs.length !== allowed.length) throw new ChangeError(`Allowed section not found unambiguously: ${allowed.join(", ")}`);
    // replace from the end so indices stay valid
    for (const s of [...secs].sort((x, y) => y.bodyStart - x.bodyStart)) {
      out.splice(s.bodyStart - offset, s.bodyEnd - s.bodyStart, `<<free:${normTitle(sectionRef(s))}>>`);
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
    throw new LockedSectionError([`change outside the allowed sections (at "${(la[i] ?? lb[i] ?? "").slice(0, 60)}")`]);
  }
}

/** Configured locks and learning sections that don't exist in the guide (typos in the config). */
export function missingLocks(text: string, rules: LockRules): string[] {
  const g = parseGuide(text);
  const titles = new Set(g.sections.map((s) => normTitle(s.title)));
  return [...lockedTitles(g, rules), ...(rules.learning ?? [])].filter((t) => !titles.has(normTitle(t)));
}

export type ChangeKind = "replace" | "extend";

export interface Change {
  section: string;
  change: ChangeKind;
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

/** Replaces the own text of a section (without checks). */
export function replaceOwnBody(text: string, s: Section, body: string[]): string {
  const g = parseGuide(text);
  const head = g.lines.slice(0, s.bodyStart);
  const rest = g.lines.slice(s.bodyEnd);
  return (rest.length ? [...head, "", ...body, "", ...rest] : [...head, "", ...body, ""]).join("\n");
}

/**
 * Applies a change to the own text of a section (heading and subsections stay untouched)
 * and runs the hard check afterwards.
 */
export function applyChange(text: string, change: Change, rules: LockRules): string {
  const g = parseGuide(text);
  const s = findSection(g, change.section);
  if (!s) throw new ChangeError(`Section not found unambiguously: "${change.section}"`);
  if (isLocked(s, rules, g)) throw new LockedSectionError([s.path.join(" > ")]);
  if (!isEditable(s, rules, g)) throw new LockedSectionError([`${s.path.join(" > ")} (outside the learning area)`]);
  if (/^#{1,6}\s/m.test(change.text)) {
    throw new ChangeError("The new text must not contain headings (the guide's structure stays human)");
  }
  const newText = trimmed(change.text.split("\n"));
  if (newText.length === 0) throw new ChangeError("The new text is empty");
  const core = trimmed(g.lines.slice(s.bodyStart, s.bodyEnd));
  const body = change.change === "replace" ? newText : core.length ? [...core, "", ...newText] : newText;
  const out = replaceOwnBody(text, s, body);
  assertGuideIntegrity(text, out, rules, [sectionRef(s)]);
  return out;
}

// ---------------------------------------------------------------------------
// Changelog row and version in the guide
// ---------------------------------------------------------------------------

export interface ChangelogEntry {
  date: string;
  part: string;
  change: string;
  evidence: string;
  approvedBy: string;
}

function cell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ").trim() || "–";
}

/**
 * Appends a row to the first table of the changelog section, mapping columns by header.
 * Knows English and German headers, so an existing German guide keeps working.
 */
export function appendChangelogRow(text: string, section: string, e: ChangelogEntry): string {
  const g = parseGuide(text);
  const s = findSection(g, section);
  if (!s) throw new ChangeError(`Changelog section not found: "${section}"`);
  const own = g.lines.slice(s.bodyStart, s.bodyEnd);
  const firstTable = own.findIndex((l) => l.trim().startsWith("|"));
  const values: Record<string, string> = {
    date: e.date,
    part: e.part,
    section: e.part,
    change: e.change,
    evidence: e.evidence,
    "approved by": e.approvedBy,
    approval: e.approvedBy,
    // German headers (existing guides)
    datum: e.date,
    teil: e.part,
    abschnitt: e.part,
    "änderung": e.change,
    aenderung: e.change,
    beleg: e.evidence,
    belege: e.evidence,
    freigabe: e.approvedBy,
  };
  let body: string[];
  if (firstTable < 0) {
    body = [...trimmed(own), ...(trimmed(own).length ? [""] : []), "| Date | Part | Change | Evidence | Approved by |", "|---|---|---|---|---|", `| ${[e.date, e.part, e.change, e.evidence, e.approvedBy].map(cell).join(" | ")} |`];
  } else {
    let last = firstTable;
    while (last + 1 < own.length && own[last + 1].trim().startsWith("|")) last++;
    const header = own[firstTable].split("|").slice(1, -1).map((h) => normTitle(h));
    const row = `| ${header.map((h) => cell(values[h] ?? "")).join(" | ")} |`;
    body = trimmed([...own.slice(0, last + 1), row, ...own.slice(last + 1)]);
  }
  return replaceOwnBody(text, s, body);
}

/** Raises the version and sets the date in the frontmatter without touching the rest of its formatting. */
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
// Tables (e.g. prompt building blocks)
// ---------------------------------------------------------------------------

/** Reads the first Markdown table of a text. */
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
