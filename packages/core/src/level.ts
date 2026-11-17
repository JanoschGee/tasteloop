/**
 * Ebenen-Vorschlag aus Bildunterschrift oder Transkript (Stichworte, konfigurierbar).
 * Ergebnis ist nur ein Vorschlag; die Ebene setzt immer ein Mensch per Knopf.
 */
import type { Ebene } from "./vault/uploads";

export const DEFAULT_STICHWORTE: Record<Ebene, string[]> = {
  kampagne: ["kampagne", "anzeige", "ad ", "ads", "werbung", "so eine anzeige", "creative", "post für", "plakat", "banner", "spot", "aktion"],
  brand: ["brand", "marke", "markenbild", "bildwelt", "bildstil", "farbe", "farbwelt", "typo", "schrift", "look", "stil", "ton", "tonalität", "identität", "logo", "gefühl"],
  merken: ["nur merken", "merken", "archiv", "für später", "nur zur info", "fyi"],
};

export function suggestLevel(text: string, stichworte: Record<Ebene, string[]> = DEFAULT_STICHWORTE): Ebene | undefined {
  const t = ` ${text.toLowerCase()} `;
  if (!t.trim()) return undefined;
  const score = (e: Ebene) => stichworte[e].reduce((n, w) => n + (t.includes(w.toLowerCase()) ? 1 : 0), 0);
  // "nur merken" ist eindeutig und schlägt alles andere
  if (stichworte.merken.some((w) => w.includes(" ") && t.includes(w))) return "merken";
  const ranked = (["kampagne", "brand", "merken"] as Ebene[]).map((e) => [e, score(e)] as const).sort((a, b) => b[1] - a[1]);
  if (ranked[0][1] === 0 || ranked[0][1] === ranked[1][1]) return undefined;
  return ranked[0][0];
}
