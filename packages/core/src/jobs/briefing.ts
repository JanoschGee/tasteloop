/**
 * Campaign brief from an upload with level "campaign".
 * The ground rule is fixed in code and does not depend on the model.
 */
import type { z } from "zod";
import { parseMd, stringifyMd } from "../frontmatter";
import { readGuide, sectionText } from "../guide/context";
import { findSection, ownBody, parseGuide, parseTable, stripMd } from "../guide/sections";
import { costUsd } from "../llm/client";
import { BriefSchema, briefSystem } from "../llm/prompts";
import type { Services } from "../services";
import { localDate, slug, wikilink } from "../util";
import { renderAnalysis, uploadNotePath, type Upload } from "../vault/uploads";
import { imageContent, userTextFor } from "./analyse";

export type Brief = z.infer<typeof BriefSchema>;

export function groundRule(brandName: string): string {
  return `> [!important] Ground rule
> **The style of the reference, the identity of ${brandName}.** Other brands' motifs, claims, characters and layouts are never copied one to one. The reference image is a style reference, not a composition template for an image model.`;
}

export function briefPath(svc: Services, u: Upload): string {
  // keep an existing brief's path (e.g. after migrating an older vault)
  return u.brief ?? `${svc.vault.dirs.briefs}/${u.id} Brief.md`;
}

export interface PromptBlock {
  name: string;
  meaning: string;
  prompt: string;
}

/** Reads the block table (first column name, last column prompt text) and the text below the table. */
export function readPromptBlocks(guide: string, ref: string | undefined): { blocks: PromptBlock[]; notes: string } {
  if (!ref) return { blocks: [], notes: "" };
  const g = parseGuide(guide);
  const s = findSection(g, ref);
  if (!s) return { blocks: [], notes: "" };
  const body = ownBody(g, s);
  const t = parseTable(body);
  const blocks = (t?.rows ?? [])
    .filter((r) => r.length >= 2)
    .map((r) => ({ name: stripMd(r[0]), meaning: r.length > 2 ? stripMd(r[1]) : "", prompt: stripMd(r[r.length - 1]) }));
  const notes = body
    .split("\n")
    .filter((l) => !l.trim().startsWith("|"))
    .join("\n")
    .trim();
  return { blocks, notes };
}

function blocksSection(svc: Services, b: Brief, guide: string): string {
  const ref = svc.cfg.guide.brief_blocks;
  const { blocks, notes } = readPromptBlocks(guide, ref);
  if (!blocks.length) return "";
  const wanted = new Set((b.prompt_blocks ?? []).map((n) => n.toLowerCase()));
  const chosen = blocks.filter((x) => wanted.has(x.name.toLowerCase()));
  const use = chosen.length ? chosen : blocks;
  const esc = (s: string) => s.replace(/\|/g, "\\|");
  const rows = use.map((x) => `| ${x.name} | ${esc(x.meaning)} | \`${esc(x.prompt)}\` |`).join("\n");
  return `
## Prompt building blocks from the guide

${chosen.length ? "Chosen to fit this reference" : "All blocks (none chosen)"}, word for word from "${ref}". The creative agent adds motif and location.

| Part | What it means | Prompt |
|---|---|---|
${rows}
${notes ? `\n${notes}\n` : ""}`;
}

function appendixSection(svc: Services, guide: string): string {
  const parts = svc.cfg.guide.brief_appendix
    .map((ref) => sectionText(svc.vault, guide, ref))
    .filter((x): x is string => !!x)
    // one heading level deeper, so they sit below "From the guide"
    .map((t) => t.replace(/^(#{1,5}) /gm, "$1## "));
  if (!parts.length) return "";
  return `
## From the guide (word for word, for production and review)

${parts.join("\n\n")}
`;
}

export function renderBrief(svc: Services, u: Upload, b: Brief, guide = ""): string {
  const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join("\n") : "- (none)");
  const uploadLink = uploadNotePath(svc.vault, u.id).replace(/\.md$/, "");
  const props = {
    type: "brief",
    brand: svc.cfg.brand.name,
    title: b.title,
    source: wikilink(uploadLink),
    reference: wikilink(u.image),
    sender: u.sender,
    created: localDate(svc.now()),
    status: "open",
    tags: ["tasteloop/brief"],
  };
  const body = `# ${slug(b.title, 120) || "Brief"}

${groundRule(svc.cfg.brand.name)}

## Reference

![[${u.image}]]

From ${u.sender}, upload [[${uploadLink}|${u.id}]].
${u.why ? `\n> ${u.why.split("\n").join("\n> ")}\n` : ""}${u.transcript.length ? `\n**Transcript:** ${u.transcript.join(" ")}\n` : ""}
## Goal

${b.goal}

## Style of the reference (take over, in abstract terms)

${list(b.style_to_take)}

## Do not take over

${list(b.do_not_take)}

## Limits from the brand guide

${b.guide_limits.length ? b.guide_limits.map((g) => `- **${g.section}:** ${g.rule}`).join("\n") : "- (none named; follow the whole guide)"}

Source: [[${svc.vault.guidePath.replace(/\.md$/, "")}]]

## Motif ideas in the brand's identity

${list(b.motif_ideas)}

## Copy ideas

${list(b.copy_ideas)}

## Open questions

${list(b.open_questions)}
${blocksSection(svc, b, guide)}${appendixSection(svc, guide)}
## Image analysis (appendix)

${u.analysis ? renderAnalysis(u.analysis).replace(/^### /gm, "#### ") : "_(none)_"}
`;
  return stringifyMd({ props, body });
}

export async function createBrief(svc: Services, u: Upload): Promise<{ path: string; costUsd?: number }> {
  const path = briefPath(svc, u);
  if (svc.vault.exists(path)) {
    const status = parseMd(svc.vault.readText(path)).props.status;
    if (status && status !== "open") {
      // the brief is already being worked on: don't overwrite it
      svc.log.info("Brief not regenerated, status is no longer open", { id: u.id, status });
      return { path };
    }
  }
  const guide = readGuide(svc.vault);
  const { data, usage } = await svc.llm.structured({
    purpose: "brief",
    model: svc.cfg.models.brief,
    system: briefSystem(svc.cfg.brand.name, guide, svc.cfg.language),
    content: [
      imageContent(svc, u.image),
      { type: "text", text: userTextFor(u, "Campaign") + (u.analysis ? `\n\nImage analysis:\n${renderAnalysis(u.analysis)}` : "") },
    ],
    schema: BriefSchema,
    effort: "medium",
  });
  svc.vault.writeText(path, renderBrief(svc, u, data, guide));
  svc.log.info("Brief written", { id: u.id, path, input: usage.inputTokens, output: usage.outputTokens, costUsd: costUsd(usage) });
  return { path, costUsd: costUsd(usage) };
}
