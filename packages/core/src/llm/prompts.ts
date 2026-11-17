/**
 * Prompts and response schemas for analysis, digest and brief.
 * Brand-neutral: brand name and guide come from the config at runtime.
 * The prompts are English; the output language follows the config (language: en | de).
 */
import { z } from "zod";
import type { Language } from "../config";

const list = z.array(z.string());

const LANGUAGE_NAME: Record<Language, string> = { en: "English", de: "German" };

export function writeIn(lang: Language): string {
  return `Write all text values in ${LANGUAGE_NAME[lang]}.`;
}

export const AnalysisSchema = z.object({
  summary: z.string().describe("1-2 sentences: what the image shows"),
  likes: list.describe("What the sender likes, or what is useful for the brand. Take it from the reason/transcript; otherwise infer carefully."),
  dislikes: list.describe("What the sender dislikes or what does not fit the brand"),
  style: z.object({
    color: list,
    light: list,
    composition: list,
    typography: list,
    material: list,
    mood: list,
  }),
  brand_fit: z.string().describe("How the image relates to the brand guide: which rule it supports, extends or contradicts"),
  level_suggestion: z.enum(["brand", "campaign", "keep", "unclear"]),
  keywords: list.describe("3-6 short lowercase style keywords"),
});

export function analysisSystem(brandName: string, guideExcerpt: string, lang: Language): string {
  return `You are a brand analyst for the brand "${brandName}". A team member sent an inspiration image, often with a spoken or written reason.

Task: record what works and what doesn't, and describe the style concretely enough for a designer or an image agent to act on it (colours with names or hex estimates, light direction, focal length/perspective, grain, type classification, and so on).

Rules:
- The person's reason takes precedence over your own judgement. Where they say something, keep its meaning; where they are silent, add carefully.
- Describe style in abstract terms. Mention other brands' logos, claims, characters or names only to place the reference, never as a template.
- Be concise: full sentences or short bullet points.
- level_suggestion: "brand" if it is about identity (colour, imagery, typography, tone), "campaign" if it is about a concrete ad or action ("we want an ad like this"), "keep" if it is archive only, otherwise "unclear".
- ${writeIn(lang)}

Excerpt of the current brand guide (context, do not change):
<brand_guide>
${guideExcerpt}
</brand_guide>`;
}

export function analysisUserText(o: { sender: string; why: string; transcript: string[]; corrections: string[]; level: string }): string {
  return `Sender: ${o.sender}
Chosen level: ${o.level}
Caption: ${o.why || "(none)"}
Voice note transcript(s): ${o.transcript.length ? o.transcript.join(" / ") : "(none)"}
Corrections: ${o.corrections.length ? o.corrections.join(" / ") : "(none)"}`;
}

// ---------------------------------------------------------------------------

const Dispute = z.object({
  point: z.string().describe("what it is about, phrased neutrally"),
  for: z.array(z.string()).describe("IDs of uploads that praise it"),
  against: z.array(z.string()).describe("IDs of uploads that criticise it"),
});

export const DigestSchema = z.object({
  summary: z.string().describe("2-4 sentences: which pattern the new uploads show"),
  proposals: z.array(
    z.object({
      title: z.string().describe('short, e.g. "Film grain is part of the imagery"'),
      section: z.string().describe('exact path of an EDITABLE section from the list, e.g. "2. Expression (learns) > 2.1 Colour"'),
      change: z.enum(["replace", "extend"]).describe("prefer extend; replace only if the current text is contradicted"),
      new_text: z.string().describe("Markdown without headings. For replace: the complete new section text. For extend: only the new paragraph or bullets."),
      reasoning: z.string(),
      evidence: z.array(z.string()).describe("IDs of the uploads that support the proposal (at least one)"),
      disputes: z.array(Dispute).describe("points of this proposal where people contradict each other; empty if everyone agrees"),
    }),
  ),
  core_notes: z
    .array(z.object({ section: z.string(), note: z.string(), evidence: z.array(z.string()) }))
    .describe("observations about a LOCKED section. They are only recorded, never applied automatically."),
  disputes_without_proposal: z.array(Dispute).describe("contradictions between people for which you deliberately make no proposal"),
});

export function digestSystem(brandName: string, lang: Language): string {
  return `You maintain the brand guide of the brand "${brandName}". Once a week you receive the team's new brand uploads (image analyses with the people's reasons) and the current guide.

Task: derive at most 5 change proposals for the guide. Every proposal must be supported by at least one upload. No proposal is better than a weak one.

Rules:
- Only change sections marked [editable] in the section list. Sections marked [locked] are the core of the brand; at most add a core_note about them. Sections marked [not learning] are never changed; at most add a core_note.
- One image is a signal, not a law. Several similar uploads weigh more. If an upload contradicts the guide, propose a refinement, not an overthrow.
- Several people contribute. What weighs is what several different people support independently, not the number of images from one person. Proposals supported by only one person are allowed; the system marks them as a single voice.
- Never resolve contradictions silently: if one person praises what another criticises, record it under "disputes" (on the affected proposal or under disputes_without_proposal) with the upload IDs of both sides. The new text must not turn a disputed point into a rule.
- Stay in the guide's tone and form (language, sentence length, list style). No headings in the new text. Keep the guide's language for new_text.
- Abstract the style: never turn other brands, claims, characters or layouts into a rule.
- Tables (e.g. tokens or prompt building blocks): for "replace", reproduce the complete table in the same format and change only the affected rows. Prompt building blocks stay in the language they are written in.
- Give the section exactly as it appears in the list.
- ${writeIn(lang)} (except new_text, which follows the guide's language)`;
}

// ---------------------------------------------------------------------------

export const BriefSchema = z.object({
  title: z.string().describe("working title of the campaign idea, short"),
  goal: z.string().describe("what the campaign should achieve, derived from the reason and the image"),
  style_to_take: z.array(z.string()).describe("abstract style features to take over"),
  do_not_take: z.array(z.string()).describe("concrete elements of the reference that must NOT be taken over (motifs, claims, characters, layout, logos)"),
  guide_limits: z.array(z.object({ section: z.string(), rule: z.string() })).describe("rules from the guide that apply to this campaign"),
  motif_ideas: z.array(z.string()).describe("2-4 own motif ideas in the brand's identity"),
  prompt_blocks: z.array(z.string()).describe("names (first column) of matching prompt building blocks from the guide's block table, if there is one; otherwise empty"),
  copy_ideas: z.array(z.string()).describe("0-3 headline or copy ideas in the guide's tone"),
  open_questions: z.array(z.string()),
});

export function briefSystem(brandName: string, guide: string, lang: Language): string {
  return `You write campaign briefs for creative agents of the brand "${brandName}". The basis is a reference image a team member sent ("we want something like this"), their reason and the image analysis.

Ground rule: the style of the reference, the identity of ${brandName}. Other brands' motifs, claims, characters and layouts are never copied one to one. The reference image is a style reference, not a composition template for an image model.

Follow the brand guide. Name the relevant limits with their section. If the guide has a table of prompt building blocks, list in prompt_blocks the names (first column) of the blocks that fit this reference; the system copies their text word for word from the guide. Be concrete and concise. ${writeIn(lang)}

<brand_guide>
${guide}
</brand_guide>`;
}
