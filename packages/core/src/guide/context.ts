import type { Vault } from "../vault/vault";
import { findSection, fullText, isEditable, isLocked, parseGuide, sectionRef, type LockRules } from "./sections";

export function lockRules(v: Vault): LockRules {
  const b = v.cfg.guide;
  return {
    locked: b.locked,
    preamble_locked: b.preamble_locked,
    locked_key: b.locked_key,
    learning: b.learning,
    locked_tokens: b.locked_tokens,
    free_keys: [b.version_key, b.date_key],
  };
}

export function readGuide(v: Vault): string {
  if (!v.exists(v.guidePath)) throw new Error(`Brand guide not found: ${v.guidePath}`);
  return v.readText(v.guidePath);
}

/** Excerpt for the image analysis (configured sections) or the whole guide. */
export function guideExcerpt(v: Vault): string {
  const text = readGuide(v);
  const refs = v.cfg.guide.analysis_context;
  if (!refs.length) return text;
  const g = parseGuide(text);
  const parts = refs.map((r) => findSection(g, r)).filter((s) => !!s).map((s) => fullText(g, s!));
  return parts.length ? parts.join("\n\n") : text;
}

/** Section list with lock marks for the digest prompt. */
export function sectionIndex(v: Vault, text: string): string {
  const g = parseGuide(text);
  const rules = lockRules(v);
  return g.sections
    .filter((s) => s.level > 1)
    .map((s) => `${"  ".repeat(s.level - 2)}- ${sectionRef(s)} [${isLocked(s, rules, g) ? "locked" : isEditable(s, rules, g) ? "editable" : "not learning"}]`)
    .join("\n");
}

/** Full text of a section (for brief appendices), heading included. */
export function sectionText(v: Vault, text: string, ref: string): string | undefined {
  const g = parseGuide(text);
  const s = findSection(g, ref);
  return s ? fullText(g, s) : undefined;
}
