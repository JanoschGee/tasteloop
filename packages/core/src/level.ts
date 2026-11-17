/**
 * Level suggestion from caption or transcript (keywords, configurable via level_keywords).
 * Only a suggestion: a person always chooses the level with a button.
 * The defaults cover English and German, so mixed teams get suggestions too.
 */
import type { Level } from "./vault/uploads";

export const DEFAULT_KEYWORDS: Record<Level, string[]> = {
  campaign: [
    "campaign", "an ad like", "ad like this", " ads ", "advert", "poster", "banner", "social post", "creative",
    "kampagne", "anzeige", "werbung", "so eine anzeige", "plakat", "aktion",
  ],
  brand: [
    "brand", "identity", "imagery", "colour", "color", "palette", "typography", "font", "type", "look", "style", "tone", "logo", "feel",
    "marke", "markenbild", "bildwelt", "bildstil", "farbe", "farbwelt", "typo", "schrift", "stil", "tonalität", "identität", "gefühl",
  ],
  keep: ["just keep", "keep this", "for later", "fyi", "archive", "nur merken", "merken", "archiv", "für später", "nur zur info"],
};

export function suggestLevel(text: string, keywords: Record<Level, string[]> = DEFAULT_KEYWORDS): Level | undefined {
  const t = ` ${text.toLowerCase()} `;
  if (!t.trim()) return undefined;
  const score = (e: Level) => keywords[e].reduce((n, w) => n + (t.includes(w.toLowerCase()) ? 1 : 0), 0);
  // multi-word "keep" phrases are unambiguous and win
  if (keywords.keep.some((w) => w.includes(" ") && t.includes(w))) return "keep";
  const ranked = (["campaign", "brand", "keep"] as Level[]).map((e) => [e, score(e)] as const).sort((a, b) => b[1] - a[1]);
  if (ranked[0][1] === 0 || ranked[0][1] === ranked[1][1]) return undefined;
  return ranked[0][0];
}
