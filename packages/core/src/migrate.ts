/**
 * migrate-en: converts an older German config and vault to the English format, without losing data.
 *
 * - Config: German keys -> English keys. Folder and file names of the old vault are kept by writing
 *   them explicitly into vault.subfolders, so no file is moved and every embed keeps working.
 * - Notes (uploads, proposals, digests, briefs, changelog): property names, status values,
 *   system headings and markers -> English. Unknown properties and sections are kept as they are.
 *   Free text written by people or by Claude stays in its language.
 * - Bases files are regenerated, the canvas gets the new group ids and labels.
 * - The brand guide is NEVER touched. A German guide keeps working: the lock comes from its
 *   frontmatter list (guide.locked_key), and changelog rows map German table headers.
 * - Dry run by default. With apply: a backup of the whole Tasteloop folder and of the old config first.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parse, stringify } from "yaml";
import { parseBrandConfig, type BrandConfig } from "./config";
import { parseMd, stringifyMd } from "./frontmatter";
import { localIso } from "./util";
import { galleryBase, proposalsBase } from "./vault/bases";
import { Vault } from "./vault/vault";

type Obj = Record<string, unknown>;

function rename(o: Obj | undefined, map: Record<string, string>): Obj | undefined {
  if (!o || typeof o !== "object") return o;
  const out: Obj = {};
  for (const [k, v] of Object.entries(o)) out[map[k] ?? k] = v;
  return out;
}

const OLD_SUBFOLDER_DEFAULTS = {
  uploads: "Uploads",
  images: "Uploads/Bilder",
  proposals: "Vorschläge",
  briefs: "Briefings",
  gallery: "Galerie.base",
  proposals_view: "Vorschläge.base",
  moodboard: "Moodboard.canvas",
  changelog: "Änderungslog.md",
};

export function isOldConfig(raw: Obj): boolean {
  return ["marke", "brand_guide", "freigebende", "transkription", "modelle", "sprache"].some((k) => k in raw);
}

/** Old German config object -> new English config object (not yet validated). */
export function migrateConfigObject(old: Obj): Obj {
  if (!isOldConfig(old)) return old;
  const tg = (old.telegram ?? {}) as Obj;
  const vault = (old.vault ?? {}) as Obj;
  const bg = (old.brand_guide ?? {}) as Obj;
  const tr = (old.transkription ?? {}) as Obj;
  const lokal = (tr.lokal ?? {}) as Obj;
  const api = (tr.api ?? {}) as Obj;
  const sub = (vault.unterordner ?? {}) as Obj;
  const kw = old.ebenen_stichworte as Obj | undefined;
  const out: Obj = {
    brand: old.marke,
    language: old.sprache ?? "de",
    channels: ["telegram"],
    telegram: rename(tg, { absender: "senders", nur_bekannte_absender: "known_senders_only", zuordnung_minuten: "attach_minutes" }),
    vault: {
      root: vault.wurzel,
      folder: vault.ordner,
      ...(vault.sync_nur !== undefined ? { sync_only: vault.sync_nur } : {}),
      ...(vault.sync_erlaubt !== undefined ? { sync_allowed: vault.sync_erlaubt } : {}),
      // keep the old folder and file names: nothing is moved, embeds keep working
      subfolders: {
        uploads: sub.uploads ?? OLD_SUBFOLDER_DEFAULTS.uploads,
        images: sub.bilder ?? OLD_SUBFOLDER_DEFAULTS.images,
        proposals: sub.vorschlaege ?? OLD_SUBFOLDER_DEFAULTS.proposals,
        briefs: sub.briefings ?? OLD_SUBFOLDER_DEFAULTS.briefs,
        gallery: sub.galerie ?? OLD_SUBFOLDER_DEFAULTS.gallery,
        proposals_view: sub.vorschlaege_ansicht ?? OLD_SUBFOLDER_DEFAULTS.proposals_view,
        moodboard: sub.moodboard ?? OLD_SUBFOLDER_DEFAULTS.moodboard,
        changelog: sub.aenderungslog ?? OLD_SUBFOLDER_DEFAULTS.changelog,
      },
    },
    guide: {
      file: bg.datei,
      locked: bg.gesperrte_abschnitte ?? [],
      locked_key: bg.frontmatter_sperre ?? "gesperrt",
      preamble_locked: bg.praeambel_gesperrt ?? true,
      learning: bg.lernbereich ?? [],
      locked_tokens: bg.gesperrte_tokens ?? [],
      ...(bg.protokoll_abschnitt !== undefined ? { changelog_section: bg.protokoll_abschnitt } : {}),
      version_key: bg.version_feld ?? "version",
      date_key: bg.datum_feld ?? "stand",
      analysis_context: bg.analyse_kontext ?? [],
      ...(bg.briefing_bausteine !== undefined ? { brief_blocks: bg.briefing_bausteine } : {}),
      brief_appendix: bg.briefing_anhaenge ?? [],
    },
    approvers: old.freigebende ?? [],
    ...(old.modelle ? { models: rename(old.modelle as Obj, { analyse: "analysis", briefing: "brief" }) } : {}),
    transcription: {
      local: rename(lokal, { aktiv: "enabled", modell: "model", sprache: "language", timeout_sekunden: "timeout_seconds" }),
      api: { enabled: api.aktiv ?? true, provider: api.anbieter ?? "elevenlabs", ...(api.modell ? { model: api.modell } : {}) },
    },
    analyze_keep: old.analyse_bei_merken ?? false,
    ...(kw ? { level_keywords: { brand: kw.brand ?? [], campaign: kw.kampagne ?? [], keep: kw.merken ?? [] } } : {}),
    ...(old.web ? { web: old.web } : {}),
  };
  return out;
}

// ---------------------------------------------------------------------------
// Notes

const LEVEL: Record<string, string> = { offen: "open", kampagne: "campaign", merken: "keep", brand: "brand" };
const UPLOAD_STATUS: Record<string, string> = { neu: "new", "in-arbeit": "processing", analysiert: "analyzed", "im-digest": "in_digest", fehler: "error" };
const PROPOSAL_STATUS: Record<string, string> = {
  offen: "open",
  freigegeben: "approved",
  abgelehnt: "rejected",
  übernommen: "applied",
  gesperrt: "locked",
  konflikt: "conflict",
  fehler: "error",
  "nicht-berechtigt": "not_allowed",
};
const TAGS: Record<string, string> = {
  "brand-system/upload": "tasteloop/upload",
  "brand-system/vorschlag": "tasteloop/proposal",
  "brand-system/einzelstimme": "tasteloop/single-voice",
  "brand-system/uneinig": "tasteloop/disputed",
  "brand-system/digest": "tasteloop/digest",
  "brand-system/briefing": "tasteloop/brief",
};

function mapTags(v: unknown): unknown {
  return Array.isArray(v) ? v.map((t) => TAGS[String(t)] ?? t) : v;
}

function replaceAll(body: string, pairs: [RegExp | string, string][]): string {
  let out = body;
  for (const [a, b] of pairs) out = typeof a === "string" ? out.split(a).join(b) : out.replace(a, b);
  return out;
}

const UPLOAD_BODY: [RegExp | string, string][] = [
  [/^## Begründung$/m, "## Why"],
  [/^## Transkript$/m, "## Transcript"],
  [/^## Korrekturen$/m, "## Corrections"],
  [/^## Fehler$/m, "## Error"],
  [/^## Analyse$/m, "## Analysis"],
  [/^### Gefällt nicht$/m, "### Dislikes"],
  [/^### Gefällt$/m, "### Likes"],
  [/^### Stilmerkmale$/m, "### Style"],
  [/^### Bezug zur Marke$/m, "### Brand fit"],
  [/^### Ebene laut Analyse\n\nKampagne$/m, "### Suggested level\n\nCampaign"],
  [/^### Ebene laut Analyse\n\nNur merken$/m, "### Suggested level\n\nJust keep"],
  [/^### Ebene laut Analyse\n\nunklar$/m, "### Suggested level\n\nunclear"],
  [/^### Ebene laut Analyse$/m, "### Suggested level"],
  ["- **Farbe:**", "- **Colour:**"],
  ["- **Licht:**", "- **Light:**"],
  ["- **Komposition:**", "- **Composition:**"],
  ["- **Typografie:**", "- **Typography:**"],
  ["- **Material und Textur:**", "- **Material and texture:**"],
  ["- **Stimmung:**", "- **Mood:**"],
  ["_(keine Bildunterschrift)_", "_(no caption)_"],
  ["_(keine Sprachnachricht)_", "_(no voice note)_"],
  ["_(noch keine Analyse)_", "_(no analysis yet)_"],
  ["- (keine Angabe)", "- (none)"],
];

const PROPOSAL_BODY: [RegExp | string, string][] = [
  ["<!-- neuer-text:start -->", "<!-- new-text:start -->"],
  ["<!-- neuer-text:end -->", "<!-- new-text:end -->"],
  [/^## Begründung$/m, "## Reasoning"],
  [/^## Änderung$/m, "## Diff"],
  [/^## Neuer Text$/m, "## New text"],
  [/^## Belege$/m, "## Evidence"],
  [/^## Uneinig$/m, "## Disputed"],
  [/^## Protokoll$/m, "## Log"],
  ["- **Dafür:**", "- **For:**"],
  ["- **Dagegen:**", "- **Against:**"],
];

export type NoteKind = "upload" | "proposal" | "digest" | "brief" | "changelog";

/** Converts one note. Returns the new text (unchanged if nothing to do or already English). */
export function migrateNote(text: string): { text: string; kind?: NoteKind } {
  const { props, body } = parseMd(text);
  const typ = props.typ;
  if (typ === undefined) return { text };
  const p: Obj = {};
  let kind: NoteKind | undefined;
  let newBody = body;
  const put = (k: string, v: unknown) => {
    if (v !== undefined) p[k] = v;
  };
  switch (typ) {
    case "upload": {
      kind = "upload";
      for (const [k, v] of Object.entries(props)) {
        switch (k) {
          case "typ": put("type", "upload"); break;
          case "marke": put("brand", v); break;
          case "ebene": put("level", LEVEL[String(v)] ?? v); break;
          case "vorgeschlagene_ebene": put("suggested_level", LEVEL[String(v)] ?? v); break;
          case "absender": put("sender", v); break;
          case "datum": put("date", v); break;
          case "status": put("status", UPLOAD_STATUS[String(v)] ?? v); break;
          case "bild": put("image", v); break;
          case "stil": put("style", v); break;
          case "briefing": put("brief", v); break;
          case "quelle": put("source", v); break;
          case "telegram_nachricht": put("message_id", v); break;
          case "tags": put("tags", mapTags(v)); break;
          default: put(k, v);
        }
      }
      newBody = replaceAll(body, UPLOAD_BODY);
      break;
    }
    case "vorschlag": {
      kind = "proposal";
      for (const [k, v] of Object.entries(props)) {
        switch (k) {
          case "typ": put("type", "proposal"); break;
          case "marke": put("brand", v); break;
          case "titel": put("title", v); break;
          case "abschnitt": put("section", v); break;
          case "art": put("change", v === "ersetzen" ? "replace" : v === "ergaenzen" ? "extend" : v); break;
          case "status": put("status", PROPOSAL_STATUS[String(v)] ?? v); break;
          case "freigegeben_von": put("approved_by", v); break;
          case "erstellt": put("created", v); break;
          case "belege": put("evidence", v); break;
          case "bild": put("image", v); break;
          case "alt_hash": put("base_hash", v); break;
          case "stuetze_personen": put("support_people", v); break;
          case "stuetze_belege": put("support_refs", v); break;
          case "stuetze_namen": put("supporters", v); break;
          case "einzelstimme": put("single_voice", v); break;
          case "uneinig": put("disputed", v); break;
          case "uneinig_geklaert": put("dispute_resolved", v); break;
          case "uebernommen_am": put("applied_at", v); break;
          case "tags": put("tags", mapTags(v)); break;
          default: put(k, v);
        }
      }
      newBody = replaceAll(body, PROPOSAL_BODY);
      break;
    }
    case "digest": {
      kind = "digest";
      const map: Record<string, string> = { typ: "type", marke: "brand", woche: "week", erstellt: "created", vorschlaege: "proposals", personen: "people", uneinig_ohne_vorschlag: "disputes_without_proposal", kern_hinweise: "core_notes" };
      for (const [k, v] of Object.entries(props)) put(map[k] ?? k, k === "tags" ? mapTags(v) : k === "typ" ? "digest" : v);
      break;
    }
    case "briefing": {
      kind = "brief";
      const map: Record<string, string> = { typ: "type", marke: "brand", titel: "title", quelle: "source", referenzbild: "reference", absender: "sender", erstellt: "created" };
      for (const [k, v] of Object.entries(props)) {
        if (k === "typ") put("type", "brief");
        else if (k === "status") put("status", v === "offen" ? "open" : v);
        else if (k === "tags") put("tags", mapTags(v));
        else put(map[k] ?? k, v);
      }
      break;
    }
    case "aenderungslog": {
      kind = "changelog";
      for (const [k, v] of Object.entries(props)) put(k === "typ" ? "type" : k, k === "typ" ? "changelog" : v);
      break;
    }
    default:
      return { text };
  }
  return { text: stringifyMd({ props: p, body: newBody }), kind };
}

/** Canvas: new group ids and labels. Image nodes and anything added by people stay as they are. */
export function migrateCanvas(text: string): string {
  let doc: { nodes?: Obj[] };
  try {
    doc = JSON.parse(text);
  } catch {
    return text;
  }
  const ids: Record<string, [string, string]> = {
    "grp-kampagne": ["grp-campaign", "Campaign"],
    "grp-merken": ["grp-keep", "Just keep"],
    "grp-offen": ["grp-open", "Open"],
    "grp-brand": ["grp-brand", "Brand"],
  };
  let changed = false;
  for (const n of doc.nodes ?? []) {
    const m = ids[String(n.id)];
    if (m && (n.id !== m[0] || n.label !== m[1])) {
      n.id = m[0];
      n.label = m[1];
      changed = true;
    }
  }
  return changed ? JSON.stringify(doc, null, "\t") + "\n" : text;
}

// ---------------------------------------------------------------------------

export interface MigrationPlan {
  configChanged: boolean;
  newConfigText: string;
  files: { path: string; kind: string }[];
}

export interface MigrationOptions {
  configPath: string;
  apply: boolean;
  backupRoot: string;
  now?: Date;
}

export interface MigrationReport extends MigrationPlan {
  applied: boolean;
  backupDir?: string;
}

function planVault(cfg: BrandConfig): { path: string; kind: string; text: string }[] {
  const v = new Vault(cfg);
  const out: { path: string; kind: string; text: string }[] = [];
  for (const dir of [v.dirs.uploads, v.dirs.proposals, v.dirs.briefs]) {
    for (const p of v.listMd(dir)) {
      const old = v.readText(p);
      const r = migrateNote(old);
      if (r.text !== old) out.push({ path: p, kind: r.kind ?? "note", text: r.text });
    }
  }
  if (v.exists(v.dirs.changelog)) {
    const old = v.readText(v.dirs.changelog);
    const r = migrateNote(old);
    if (r.text !== old) out.push({ path: v.dirs.changelog, kind: "changelog", text: r.text });
  }
  if (v.exists(v.dirs.moodboard)) {
    const old = v.readText(v.dirs.moodboard);
    const t = migrateCanvas(old);
    if (t !== old) out.push({ path: v.dirs.moodboard, kind: "canvas", text: t });
  }
  for (const [path, gen] of [
    [v.dirs.gallery, galleryBase(v)],
    [v.dirs.proposalsView, proposalsBase(v)],
  ] as const) {
    // only regenerate views that still use the old German properties or values
    if (v.exists(path) && v.readText(path) !== gen && /typ ==|ebene|absender|datum|note\.bild|stuetze|freigegeben|uneinig|"offen"|"vorschlag"|erstellt/.test(v.readText(path))) {
      out.push({ path, kind: "base", text: gen });
    }
  }
  // the guide is never part of the migration
  return out.filter((f) => f.path !== v.guidePath);
}

export function migrate(opts: MigrationOptions): MigrationReport {
  const rawText = readFileSync(opts.configPath, "utf8");
  const raw = (parse(rawText) ?? {}) as Obj;
  const configChanged = isOldConfig(raw);
  const header = `# Tasteloop brand configuration (converted to English keys by migrate-en on ${localIso(opts.now ?? new Date()).slice(0, 10)}).\n# See docs/configuration.md. Never put tokens or API keys here.\n`;
  const newConfigText = configChanged ? header + stringify(migrateConfigObject(raw), { lineWidth: 0 }) : rawText;
  const cfg = parseBrandConfig(newConfigText, opts.configPath);
  const files = planVault(cfg);
  const report: MigrationReport = { configChanged, newConfigText, files: files.map(({ path, kind }) => ({ path, kind })), applied: false };
  if (!opts.apply || (!configChanged && !files.length)) return report;

  const stamp = localIso(opts.now ?? new Date()).replace(/[:T]/g, "-");
  const backupDir = join(opts.backupRoot, `migrate-en-${stamp}`);
  mkdirSync(backupDir, { recursive: true });
  writeFileSync(join(backupDir, basename(opts.configPath)), rawText);
  const v = new Vault(cfg);
  const folder = v.abs(v.brandDir);
  if (existsSync(folder)) cpSync(folder, join(backupDir, "vault-folder"), { recursive: true });
  const guideBefore = v.exists(v.guidePath) ? v.readText(v.guidePath) : undefined;

  for (const f of files) v.writeText(f.path, f.text);
  if (configChanged) writeFileSync(opts.configPath, newConfigText, { mode: 0o600 });

  // paranoia: the guide must be byte-identical
  if (guideBefore !== undefined && v.readText(v.guidePath) !== guideBefore) {
    throw new Error("The brand guide changed during migration. This must never happen; restore from the backup.");
  }
  return { ...report, applied: true, backupDir };
}
