/**
 * Read-only access for the web gallery. No LLM, no Telegram, no writes.
 */
import { extname } from "node:path";
import { loadBrandConfig, type BrandConfig } from "./config";
import { parseMd } from "./frontmatter";
import { lockRules } from "./guide/context";
import { isLocked, parseGuide, sectionRef } from "./guide/sections";
import { asArray, unwikilink } from "./util";
import { listUploads, readUpload, type Upload } from "./vault/uploads";
import { Vault } from "./vault/vault";

export type { Upload, Level, LevelOrOpen, Analysis } from "./vault/uploads";
export { LEVELS, LEVEL_LABEL, STYLE_LABEL } from "./vault/uploads";

export interface Reader {
  cfg: BrandConfig;
  vault: Vault;
}

export function openReader(configPath: string): Reader {
  const cfg = loadBrandConfig(configPath);
  return { cfg, vault: new Vault(cfg) };
}

export function uploads(r: Reader): Upload[] {
  return listUploads(r.vault);
}

export function upload(r: Reader, id: string): Upload | undefined {
  if (!/^[\w-]+$/.test(id)) return undefined;
  return readUpload(r.vault, id);
}

export interface GuideBlock {
  ref: string;
  level: number;
  locked: boolean;
  /** Markdown including the heading, own text only */
  markdown: string;
}

export function guideBlocks(r: Reader): { title: string; blocks: GuideBlock[]; preamble: string } | undefined {
  if (!r.vault.exists(r.vault.guidePath)) return undefined;
  const text = r.vault.readText(r.vault.guidePath);
  const g = parseGuide(text);
  const rules = lockRules(r.vault);
  const h1 = g.sections.find((s) => s.level === 1);
  return {
    title: h1?.title ?? r.vault.guidePath.split("/").pop()!.replace(/\.md$/, ""),
    preamble: g.lines.slice(h1 ? h1.bodyStart : 0, g.preambleEnd).join("\n").replace(/^---[\s\S]*?---\n/, ""),
    blocks: g.sections
      .filter((s) => s.level > 1)
      .map((s) => ({
        ref: sectionRef(s),
        level: s.level,
        locked: isLocked(s, rules, g),
        markdown: g.lines.slice(s.headingLine, s.bodyEnd).join("\n"),
      })),
  };
}

export interface NoteSummary {
  path: string;
  name: string;
  props: Record<string, unknown>;
  body: string;
  image?: string;
}

function notes(r: Reader, dir: string, typ?: string): NoteSummary[] {
  return r.vault
    .listMd(dir)
    .map((path) => {
      const { props, body } = parseMd(r.vault.readText(path));
      return { path, name: path.split("/").pop()!.replace(/\.md$/, ""), props, body, image: unwikilink(props.image ?? props.reference) };
    })
    .filter((n) => !typ || n.props.type === typ)
    .sort((a, b) => b.name.localeCompare(a.name));
}

export function proposals(r: Reader): NoteSummary[] {
  return notes(r, r.vault.dirs.proposals, "proposal");
}

export function digests(r: Reader): NoteSummary[] {
  return notes(r, r.vault.dirs.proposals, "digest");
}

export function briefs(r: Reader): NoteSummary[] {
  return notes(r, r.vault.dirs.briefs, "brief");
}

export function noteByName(list: NoteSummary[], name: string): NoteSummary | undefined {
  return list.find((n) => n.name === name);
}

export const IMAGE_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/**
 * Returns an image from Tasteloop's folder. Anything outside (including via ../) is refused.
 */
export function readImage(r: Reader, relPath: string): { data: Buffer; type: string } | undefined {
  const clean = relPath.replace(/\\/g, "/");
  if (clean.split("/").some((p) => p === ".." || p.startsWith("."))) return undefined;
  const type = IMAGE_TYPES[extname(clean).toLowerCase()];
  if (!type) return undefined;
  if (!clean.startsWith(r.vault.brandDir + "/")) return undefined;
  try {
    if (!r.vault.exists(clean)) return undefined;
    return { data: r.vault.readBytes(clean), type };
  } catch {
    return undefined;
  }
}

export { asArray, unwikilink };

/**
 * Uploads cited as evidence in an applied or approved proposal.
 * The gallery circles them in red pencil ("made it into the guide").
 */
export function acceptedUploadIds(r: Reader): Set<string> {
  const ids = new Set<string>();
  for (const p of proposals(r)) {
    if (p.props.status !== "applied" && p.props.status !== "approved") continue;
    for (const b of asArray(p.props.evidence as string[] | string | undefined)) {
      const path = unwikilink(b);
      const id = path?.split("/").pop()?.replace(/\.md$/, "");
      if (id) ids.add(id);
    }
  }
  return ids;
}
