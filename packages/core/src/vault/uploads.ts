/**
 * Upload notes: one note per image.
 * Properties: type, id, brand, level, sender, date, status, image, ...
 * Body: embedded image, why, transcript, corrections, analysis.
 * Sections a person adds in Obsidian are kept when the note is rewritten.
 */
import { joinH2, parseMd, splitH2, stringifyMd } from "../frontmatter";
import { asArray, unwikilink, wikilink } from "../util";
import type { Vault } from "./vault";

export const LEVELS = ["brand", "campaign", "keep"] as const;
export type Level = (typeof LEVELS)[number];
export type LevelOrOpen = Level | "open";

export const LEVEL_LABEL: Record<LevelOrOpen, string> = {
  brand: "Brand",
  campaign: "Campaign",
  keep: "Just keep",
  open: "Open",
};

export type UploadStatus = "new" | "processing" | "analyzed" | "in_digest" | "error";

export interface Style {
  color: string[];
  light: string[];
  composition: string[];
  typography: string[];
  material: string[];
  mood: string[];
}

export interface Analysis {
  summary: string;
  likes: string[];
  dislikes: string[];
  style: Style;
  brand_fit: string;
  level_suggestion: Level | "unclear";
  keywords: string[];
}

export interface Correction {
  time: string;
  sender: string;
  text: string;
}

export interface Upload {
  id: string;
  brand: string;
  level: LevelOrOpen;
  suggestedLevel?: Level;
  sender: string;
  date: string;
  status: UploadStatus;
  /** vault-relative path of the image */
  image: string;
  why: string;
  transcript: string[];
  corrections: Correction[];
  analysis?: Analysis;
  error?: string;
  brief?: string;
  digest?: string;
  messageId?: number;
  /** sections added by people (kept) */
  extraSections: { key: string; text: string }[];
}

export const H = {
  why: "Why",
  transcript: "Transcript",
  corrections: "Corrections",
  analysis: "Analysis",
  error: "Error",
} as const;
const KNOWN = new Set<string>(Object.values(H));

export function uploadNotePath(v: Vault, id: string): string {
  return `${v.dirs.uploads}/${id}.md`;
}

const NONE = "(none)";

function bullets(xs: string[]): string {
  return xs.length ? xs.map((x) => `- ${x}`).join("\n") : `- ${NONE}`;
}

function parseBullets(text: string): string[] {
  return text
    .split("\n")
    .map((l) => /^\s*-\s+(.*)$/.exec(l)?.[1]?.trim())
    .filter((x): x is string => !!x && x !== NONE);
}

export const STYLE_LABEL: Record<keyof Style, string> = {
  color: "Colour",
  light: "Light",
  composition: "Composition",
  typography: "Typography",
  material: "Material and texture",
  mood: "Mood",
};

export const ANALYSIS_H = {
  likes: "Likes",
  dislikes: "Dislikes",
  style: "Style",
  fit: "Brand fit",
  level: "Suggested level",
} as const;

export function renderAnalysis(a: Analysis): string {
  const style = (Object.keys(STYLE_LABEL) as (keyof Style)[])
    .filter((k) => a.style[k]?.length)
    .map((k) => `- **${STYLE_LABEL[k]}:** ${a.style[k].join("; ")}`)
    .join("\n");
  return [
    a.summary,
    `### ${ANALYSIS_H.likes}\n\n${bullets(a.likes)}`,
    `### ${ANALYSIS_H.dislikes}\n\n${bullets(a.dislikes)}`,
    `### ${ANALYSIS_H.style}\n\n${style || `- ${NONE}`}`,
    `### ${ANALYSIS_H.fit}\n\n${a.brand_fit}`,
    `### ${ANALYSIS_H.level}\n\n${a.level_suggestion === "unclear" ? "unclear" : LEVEL_LABEL[a.level_suggestion]}`,
  ].join("\n\n");
}

/** Reads the analysis back from the rendered section (for digest and gallery). */
export function parseAnalysis(text: string, props: Record<string, unknown>): Analysis | undefined {
  if (!text.trim()) return undefined;
  const lines: Record<string, string[]> = { _: [] };
  let cur = "_";
  for (const l of text.split("\n")) {
    const m = /^### (.+?)\s*$/.exec(l);
    if (m) {
      cur = m[1];
      lines[cur] = [];
    } else lines[cur].push(l);
  }
  const subs: Record<string, string> = {};
  for (const [k, v] of Object.entries(lines)) subs[k] = v.join("\n").trim();
  const style: Style = { color: [], light: [], composition: [], typography: [], material: [], mood: [] };
  for (const line of (subs[ANALYSIS_H.style] ?? "").split("\n")) {
    const m = /^- \*\*(.+?):\*\* (.*)$/.exec(line);
    if (!m) continue;
    const key = (Object.keys(STYLE_LABEL) as (keyof Style)[]).find((k) => STYLE_LABEL[k] === m[1]);
    if (key) style[key] = m[2].split("; ").map((s) => s.trim()).filter(Boolean);
  }
  const levelText = (subs[ANALYSIS_H.level] ?? "").trim();
  const level = (Object.entries(LEVEL_LABEL).find(([, l]) => l === levelText)?.[0] ?? "unclear") as Level | "unclear" | "open";
  return {
    summary: subs["_"] ?? "",
    likes: parseBullets(subs[ANALYSIS_H.likes] ?? ""),
    dislikes: parseBullets(subs[ANALYSIS_H.dislikes] ?? ""),
    style,
    brand_fit: subs[ANALYSIS_H.fit] ?? "",
    level_suggestion: level === "open" ? "unclear" : level,
    keywords: asArray(props["style"] as string[] | undefined),
  };
}

const PLACEHOLDER = /^_\(.*\)_$/;

export function renderUpload(u: Upload): string {
  const props: Record<string, unknown> = {
    type: "upload",
    id: u.id,
    brand: u.brand,
    level: u.level,
    suggested_level: u.suggestedLevel,
    sender: u.sender,
    date: u.date,
    status: u.status,
    image: wikilink(u.image),
    style: u.analysis?.keywords?.length ? u.analysis.keywords : undefined,
    brief: u.brief ? wikilink(u.brief) : undefined,
    digest: u.digest ? wikilink(u.digest) : undefined,
    source: "telegram",
    message_id: u.messageId,
    tags: ["tasteloop/upload"],
  };
  const parts: { key: string; text: string }[] = [{ key: "", text: `![[${u.image}]]` }];
  parts.push({ key: H.why, text: u.why.trim() ? u.why.trim().split("\n").map((l) => `> ${l}`).join("\n") : "_(no caption)_" });
  parts.push({ key: H.transcript, text: u.transcript.length ? u.transcript.map((t) => t.trim()).join("\n\n") : "_(no voice note)_" });
  if (u.corrections.length) {
    parts.push({
      key: H.corrections,
      text: u.corrections.map((k) => `- ${k.time.replace("T", " ").slice(0, 16)} (${k.sender}): ${k.text}`).join("\n"),
    });
  }
  if (u.error) parts.push({ key: H.error, text: u.error });
  parts.push({ key: H.analysis, text: u.analysis ? renderAnalysis(u.analysis) : "_(no analysis yet)_" });
  parts.push(...u.extraSections);
  return stringifyMd({ props, body: joinH2(parts) });
}

export function parseUpload(text: string): Upload {
  const { props, body } = parseMd(text);
  const sections = splitH2(body);
  const get = (k: string) => sections.find((s) => s.key === k)?.text ?? "";
  const why = get(H.why);
  const transcript = get(H.transcript);
  const corr = get(H.corrections);
  const analysisText = get(H.analysis);
  return {
    id: String(props.id ?? ""),
    brand: String(props.brand ?? ""),
    level: (props.level as LevelOrOpen) ?? "open",
    suggestedLevel: (props.suggested_level as Level) || undefined,
    sender: String(props.sender ?? ""),
    date: String(props.date ?? ""),
    status: (props.status as UploadStatus) ?? "new",
    image: unwikilink(props.image) ?? "",
    why: PLACEHOLDER.test(why) ? "" : why.split("\n").map((l) => l.replace(/^> ?/, "")).join("\n"),
    transcript: PLACEHOLDER.test(transcript) ? [] : transcript.split(/\n{2,}/).filter(Boolean),
    corrections: corr
      .split("\n")
      .map((l) => /^- (\d{4}-\d\d-\d\d \d\d:\d\d) \((.+?)\): (.*)$/.exec(l))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => ({ time: m[1].replace(" ", "T") + ":00", sender: m[2], text: m[3] })),
    analysis: PLACEHOLDER.test(analysisText) ? undefined : parseAnalysis(analysisText, props),
    error: get(H.error) || undefined,
    brief: unwikilink(props.brief),
    digest: unwikilink(props.digest),
    messageId: typeof props.message_id === "number" ? props.message_id : undefined,
    extraSections: sections.filter((s) => s.key !== "" && !KNOWN.has(s.key)),
  };
}

export function readUpload(v: Vault, id: string): Upload | undefined {
  const p = uploadNotePath(v, id);
  return v.exists(p) ? parseUpload(v.readText(p)) : undefined;
}

export function writeUpload(v: Vault, u: Upload): void {
  v.writeText(uploadNotePath(v, u.id), renderUpload(u));
}

export function listUploads(v: Vault): Upload[] {
  return v
    .listMd(v.dirs.uploads)
    .map((p) => {
      try {
        return parseUpload(v.readText(p));
      } catch {
        return undefined;
      }
    })
    .filter((u): u is Upload => !!u && !!u.id)
    .sort((a, b) => b.date.localeCompare(a.date));
}
