/**
 * Upload-Notizen: eine Notiz pro Bild.
 * Properties: typ, id, marke, ebene, absender, datum, status, bild, ...
 * Body: eingebettetes Bild, Begründung, Transkript, Korrekturen, Analyse.
 * Eigene Abschnitte, die jemand in Obsidian ergänzt, bleiben beim Neuschreiben erhalten.
 */
import { joinH2, parseMd, splitH2, stringifyMd } from "../frontmatter";
import { asArray, unwikilink, wikilink } from "../util";
import type { Vault } from "./vault";

export const EBENEN = ["brand", "kampagne", "merken"] as const;
export type Ebene = (typeof EBENEN)[number];
export type EbeneOderOffen = Ebene | "offen";

export const EBENEN_LABEL: Record<EbeneOderOffen, string> = {
  brand: "Brand",
  kampagne: "Kampagne",
  merken: "Nur merken",
  offen: "Offen",
};

export type UploadStatus = "neu" | "in-arbeit" | "analysiert" | "im-digest" | "fehler";

export interface Stilmerkmale {
  farbe: string[];
  licht: string[];
  komposition: string[];
  typografie: string[];
  material_textur: string[];
  stimmung: string[];
}

export interface Analyse {
  kurzbeschreibung: string;
  gefaellt: string[];
  gefaellt_nicht: string[];
  stilmerkmale: Stilmerkmale;
  bezug_zur_marke: string;
  ebene_empfehlung: Ebene | "unklar";
  schlagworte: string[];
}

export interface Korrektur {
  zeit: string;
  absender: string;
  text: string;
}

export interface Upload {
  id: string;
  marke: string;
  ebene: EbeneOderOffen;
  vorgeschlageneEbene?: Ebene;
  absender: string;
  datum: string;
  status: UploadStatus;
  /** vault-relativer Pfad des Bildes */
  bild: string;
  begruendung: string;
  transkript: string[];
  korrekturen: Korrektur[];
  analyse?: Analyse;
  fehler?: string;
  briefing?: string;
  digest?: string;
  telegramNachricht?: number;
  /** vom Menschen ergänzte, unbekannte Abschnitte (bleiben erhalten) */
  extraSections: { key: string; text: string }[];
}

const KNOWN = new Set(["Begründung", "Transkript", "Korrekturen", "Analyse", "Fehler"]);

export function uploadNotePath(v: Vault, id: string): string {
  return `${v.dirs.uploads}/${id}.md`;
}

function bullets(xs: string[]): string {
  return xs.length ? xs.map((x) => `- ${x}`).join("\n") : "- (keine Angabe)";
}

function parseBullets(text: string): string[] {
  return text
    .split("\n")
    .map((l) => /^\s*-\s+(.*)$/.exec(l)?.[1]?.trim())
    .filter((x): x is string => !!x && x !== "(keine Angabe)");
}

const STIL_LABEL: Record<keyof Stilmerkmale, string> = {
  farbe: "Farbe",
  licht: "Licht",
  komposition: "Komposition",
  typografie: "Typografie",
  material_textur: "Material und Textur",
  stimmung: "Stimmung",
};

export function renderAnalyse(a: Analyse): string {
  const stil = (Object.keys(STIL_LABEL) as (keyof Stilmerkmale)[])
    .filter((k) => a.stilmerkmale[k]?.length)
    .map((k) => `- **${STIL_LABEL[k]}:** ${a.stilmerkmale[k].join("; ")}`)
    .join("\n");
  return [
    a.kurzbeschreibung,
    `### Gefällt\n\n${bullets(a.gefaellt)}`,
    `### Gefällt nicht\n\n${bullets(a.gefaellt_nicht)}`,
    `### Stilmerkmale\n\n${stil || "- (keine Angabe)"}`,
    `### Bezug zur Marke\n\n${a.bezug_zur_marke}`,
    `### Ebene laut Analyse\n\n${a.ebene_empfehlung === "unklar" ? "unklar" : EBENEN_LABEL[a.ebene_empfehlung]}`,
  ].join("\n\n");
}

/** Liest die Analyse aus dem gerenderten Abschnitt zurück (für Digest und Web). */
export function parseAnalyse(text: string, props: Record<string, unknown>): Analyse | undefined {
  if (!text.trim()) return undefined;
  const subs: Record<string, string> = {};
  let cur = "_";
  const lines: Record<string, string[]> = { _: [] };
  for (const l of text.split("\n")) {
    const m = /^### (.+?)\s*$/.exec(l);
    if (m) {
      cur = m[1];
      lines[cur] = [];
    } else lines[cur].push(l);
  }
  for (const [k, v] of Object.entries(lines)) subs[k] = v.join("\n").trim();
  const stil: Stilmerkmale = { farbe: [], licht: [], komposition: [], typografie: [], material_textur: [], stimmung: [] };
  for (const line of (subs["Stilmerkmale"] ?? "").split("\n")) {
    const m = /^- \*\*(.+?):\*\* (.*)$/.exec(line);
    if (!m) continue;
    const key = (Object.keys(STIL_LABEL) as (keyof Stilmerkmale)[]).find((k) => STIL_LABEL[k] === m[1]);
    if (key) stil[key] = m[2].split("; ").map((s) => s.trim()).filter(Boolean);
  }
  const ebeneText = (subs["Ebene laut Analyse"] ?? "").trim();
  const ebene = (Object.entries(EBENEN_LABEL).find(([, l]) => l === ebeneText)?.[0] ?? "unklar") as Ebene | "unklar";
  return {
    kurzbeschreibung: subs["_"] ?? "",
    gefaellt: parseBullets(subs["Gefällt"] ?? ""),
    gefaellt_nicht: parseBullets(subs["Gefällt nicht"] ?? ""),
    stilmerkmale: stil,
    bezug_zur_marke: subs["Bezug zur Marke"] ?? "",
    ebene_empfehlung: ebene === ("offen" as string) ? "unklar" : ebene,
    schlagworte: asArray(props["stil"] as string[] | undefined),
  };
}

export function renderUpload(u: Upload): string {
  const props: Record<string, unknown> = {
    typ: "upload",
    id: u.id,
    marke: u.marke,
    ebene: u.ebene,
    vorgeschlagene_ebene: u.vorgeschlageneEbene,
    absender: u.absender,
    datum: u.datum,
    status: u.status,
    bild: wikilink(u.bild),
    stil: u.analyse?.schlagworte?.length ? u.analyse.schlagworte : undefined,
    briefing: u.briefing ? wikilink(u.briefing) : undefined,
    digest: u.digest ? wikilink(u.digest) : undefined,
    quelle: "telegram",
    telegram_nachricht: u.telegramNachricht,
    tags: ["brand-system/upload"],
  };
  const parts: { key: string; text: string }[] = [{ key: "", text: `![[${u.bild}]]` }];
  parts.push({
    key: "Begründung",
    text: u.begruendung.trim() ? u.begruendung.trim().split("\n").map((l) => `> ${l}`).join("\n") : "_(keine Bildunterschrift)_",
  });
  parts.push({
    key: "Transkript",
    text: u.transkript.length ? u.transkript.map((t) => t.trim()).join("\n\n") : "_(keine Sprachnachricht)_",
  });
  if (u.korrekturen.length) {
    parts.push({
      key: "Korrekturen",
      text: u.korrekturen.map((k) => `- ${k.zeit.replace("T", " ").slice(0, 16)} (${k.absender}): ${k.text}`).join("\n"),
    });
  }
  if (u.fehler) parts.push({ key: "Fehler", text: u.fehler });
  parts.push({ key: "Analyse", text: u.analyse ? renderAnalyse(u.analyse) : "_(noch keine Analyse)_" });
  parts.push(...u.extraSections);
  return stringifyMd({ props, body: joinH2(parts) });
}

export function parseUpload(text: string): Upload {
  const { props, body } = parseMd(text);
  const sections = splitH2(body);
  const get = (k: string) => sections.find((s) => s.key === k)?.text ?? "";
  const begr = get("Begründung");
  const transkript = get("Transkript");
  const korr = get("Korrekturen");
  const analyseText = get("Analyse");
  return {
    id: String(props.id ?? ""),
    marke: String(props.marke ?? ""),
    ebene: (props.ebene as EbeneOderOffen) ?? "offen",
    vorgeschlageneEbene: (props.vorgeschlagene_ebene as Ebene) || undefined,
    absender: String(props.absender ?? ""),
    datum: String(props.datum ?? ""),
    status: (props.status as UploadStatus) ?? "neu",
    bild: unwikilink(props.bild) ?? "",
    begruendung: begr.startsWith("_(") ? "" : begr.split("\n").map((l) => l.replace(/^> ?/, "")).join("\n"),
    transkript: transkript.startsWith("_(") ? [] : transkript.split(/\n{2,}/).filter(Boolean),
    korrekturen: korr
      .split("\n")
      .map((l) => /^- (\d{4}-\d\d-\d\d \d\d:\d\d) \((.+?)\): (.*)$/.exec(l))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => ({ zeit: m[1].replace(" ", "T") + ":00", absender: m[2], text: m[3] })),
    analyse: analyseText.startsWith("_(") ? undefined : parseAnalyse(analyseText, props),
    fehler: get("Fehler") || undefined,
    briefing: unwikilink(props.briefing),
    digest: unwikilink(props.digest),
    telegramNachricht: typeof props.telegram_nachricht === "number" ? props.telegram_nachricht : undefined,
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
    .sort((a, b) => b.datum.localeCompare(a.datum));
}
