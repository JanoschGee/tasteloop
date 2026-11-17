import type { Vault } from "../vault/vault";
import { findSection, fullText, isEditable, isLocked, parseGuide, sectionRef, type LockRules } from "./sections";

export function lockRules(v: Vault): LockRules {
  const b = v.cfg.brand_guide;
  return {
    gesperrte_abschnitte: b.gesperrte_abschnitte,
    praeambel_gesperrt: b.praeambel_gesperrt,
    frontmatter_sperre: b.frontmatter_sperre,
    lernbereich: b.lernbereich,
    gesperrte_tokens: b.gesperrte_tokens,
    frontmatter_frei: [b.version_feld, b.datum_feld],
  };
}

export function readGuide(v: Vault): string {
  if (!v.exists(v.guidePath)) throw new Error(`Brand Guide nicht gefunden: ${v.guidePath}`);
  return v.readText(v.guidePath);
}

/** Auszug für die Bildanalyse (konfigurierte Abschnitte) oder ganzer Guide. */
export function guideExcerpt(v: Vault): string {
  const text = readGuide(v);
  const refs = v.cfg.brand_guide.analyse_kontext;
  if (!refs.length) return text;
  const g = parseGuide(text);
  const parts = refs.map((r) => findSection(g, r)).filter((s) => !!s).map((s) => fullText(g, s!));
  return parts.length ? parts.join("\n\n") : text;
}

/** Abschnittsliste mit Sperrvermerk für den Digest-Prompt. */
export function sectionIndex(v: Vault, text: string): string {
  const g = parseGuide(text);
  const rules = lockRules(v);
  return g.sections
    .filter((s) => s.level > 1)
    .map((s) => `${"  ".repeat(s.level - 2)}- ${sectionRef(s)} [${isLocked(s, rules, g) ? "gesperrt" : isEditable(s, rules, g) ? "bearbeitbar" : "nicht lernbar"}]`)
    .join("\n");
}

/** Eigener Text eines Abschnitts (für Briefing-Anhänge), Überschrift inklusive. */
export function sectionText(v: Vault, text: string, ref: string): string | undefined {
  const g = parseGuide(text);
  const s = findSection(g, ref);
  return s ? fullText(g, s) : undefined;
}
