/**
 * Weekly digest: reads new brand uploads, asks Claude for change proposals and writes one note
 * per proposal (diff against the guide, evidence images, support, disputes).
 * Proposals for locked sections are never created as applicable proposals.
 */
import { diffLines } from "diff";
import type { z } from "zod";
import { stringifyMd } from "../frontmatter";
import { lockRules, readGuide, sectionIndex } from "../guide/context";
import { findSection, hash, isEditable, isLocked, ownBody, parseGuide, sectionRef } from "../guide/sections";
import { costUsd } from "../llm/client";
import { DigestSchema, digestSystem } from "../llm/prompts";
import type { Services } from "../services";
import { localDate, slug, wikilink } from "../util";
import { listUploads, renderAnalysis, uploadNotePath, writeUpload, type Upload } from "../vault/uploads";
import type { Vault } from "../vault/vault";

export type DigestResponse = z.infer<typeof DigestSchema>;

export const NEW_TEXT_START = "<!-- new-text:start -->";
export const NEW_TEXT_END = "<!-- new-text:end -->";

export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function renderDiff(oldText: string, newText: string): string {
  const parts = diffLines(oldText.trim() + "\n", newText.trim() + "\n");
  const out: string[] = [];
  for (const p of parts) {
    const lines = p.value.replace(/\n$/, "").split("\n");
    const prefix = p.added ? "+ " : p.removed ? "- " : "  ";
    for (const l of lines) out.push(prefix + l);
  }
  return out.join("\n");
}

export interface Support {
  people: string[];
  refs: number;
  singleVoice: boolean;
}

/** Support from the evidence: different people and number of references (computed, not from the model). */
export function supportOf(evidence: Upload[]): Support {
  const people = [...new Set(evidence.map((u) => u.sender))].sort((a, b) => a.localeCompare(b));
  return { people, refs: evidence.length, singleVoice: people.length === 1 };
}

export function supportText(s: { people: number | string[]; refs: number }): string {
  const n = typeof s.people === "number" ? s.people : s.people.length;
  return `${n} ${n === 1 ? "person" : "people"}, ${s.refs} ${s.refs === 1 ? "reference" : "references"}`;
}

export interface Dispute {
  point: string;
  for: Upload[];
  against: Upload[];
}

/**
 * Validates a reported dispute: both sides have evidence, and at least one person on one side
 * is someone else than on the other side. Otherwise it is not a dispute between people.
 */
export function validateDispute(raw: { point: string; for: string[]; against: string[] }, byId: Map<string, Upload>): Dispute | undefined {
  const pro = [...new Set(raw.for)].map((i) => byId.get(i)).filter((u): u is Upload => !!u);
  const con = [...new Set(raw.against)].map((i) => byId.get(i)).filter((u): u is Upload => !!u);
  if (!pro.length || !con.length) return undefined;
  const pp = new Set(pro.map((u) => u.sender));
  const cp = new Set(con.map((u) => u.sender));
  const betweenPeople = [...pp].some((a) => [...cp].some((b) => a !== b));
  return betweenPeople ? { point: raw.point, for: pro, against: con } : undefined;
}

function side(v: Vault, us: Upload[]): string {
  return us.map((u) => `[[${uploadNotePath(v, u.id).replace(/\.md$/, "")}|${u.id}]] (${u.sender})`).join(", ");
}

export interface DigestResult {
  proposals: string[];
  /** per proposal: title, support, number of disputed points */
  details: { path: string; title: string; people: number; refs: number; singleVoice: boolean; disputed: number }[];
  disputesWithoutProposal: number;
  coreNotes: number;
  uploads: number;
  digestNote?: string;
  costUsd?: number;
  dropped: string[];
}

export function digestCandidates(svc: Services): Upload[] {
  return listUploads(svc.vault)
    .filter((u) => u.level === "brand" && u.status === "analyzed" && !u.digest)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function runDigest(svc: Services): Promise<DigestResult> {
  const v = svc.vault;
  const uploads = digestCandidates(svc);
  const week = isoWeek(svc.now());
  if (!uploads.length) {
    svc.log.info("Digest: no new brand uploads");
    return { proposals: [], details: [], disputesWithoutProposal: 0, coreNotes: 0, uploads: 0, dropped: [] };
  }
  const guide = readGuide(v);
  const rules = lockRules(v);
  const g = parseGuide(guide);
  const ids = new Set(uploads.map((u) => u.id));
  const byId = new Map(uploads.map((u) => [u.id, u]));
  const peopleTotal = new Set(uploads.map((u) => u.sender)).size;

  const uploadText = uploads
    .map(
      (u) =>
        `<upload id="${u.id}" sender="${u.sender}" date="${u.date}">\nReason: ${u.why || "(none)"}\nTranscript: ${u.transcript.join(" ") || "(none)"}\nCorrections: ${u.corrections.map((k) => k.text).join(" / ") || "(none)"}\nAnalysis:\n${u.analysis ? renderAnalysis(u.analysis) : "(none)"}\n</upload>`,
    )
    .join("\n\n");

  const { data, usage } = await svc.llm.structured({
    purpose: "digest",
    model: svc.cfg.models.digest,
    system: digestSystem(svc.cfg.brand.name, svc.cfg.language),
    content: [
      { type: "text", text: `<brand_guide>\n${guide}\n</brand_guide>\n\n<sections>\n${sectionIndex(v, guide)}\n</sections>` },
      { type: "text", text: `New brand uploads (${uploads.length}, from ${peopleTotal} ${peopleTotal === 1 ? "person" : "people"}):\n\n${uploadText}` },
    ],
    schema: DigestSchema,
    effort: "high",
  });

  const created: string[] = [];
  const details: DigestResult["details"] = [];
  const dropped: string[] = [];
  const core: DigestResponse["core_notes"] = [...data.core_notes];
  const date = localDate(svc.now());

  data.proposals.forEach((p, i) => {
    const evidence = p.evidence.filter((b) => ids.has(b));
    const s = findSection(g, p.section);
    if (!s) {
      dropped.push(`"${p.title}": section "${p.section}" not found unambiguously`);
      return;
    }
    if (isLocked(s, rules, g) || !isEditable(s, rules, g)) {
      // never an applicable proposal: only a note for people
      const why = isLocked(s, rules, g) ? "" : " (outside the learning area)";
      core.push({ section: sectionRef(s) + why, note: `${p.title}: ${p.reasoning}`, evidence });
      return;
    }
    if (!evidence.length) {
      dropped.push(`"${p.title}": no valid evidence`);
      return;
    }
    if (/^#{1,6}\s/m.test(p.new_text)) {
      dropped.push(`"${p.title}": new text contains headings`);
      return;
    }
    const old = ownBody(g, s);
    const next = p.change === "replace" ? p.new_text : `${old.trim()}\n\n${p.new_text.trim()}`;
    const path = `${v.dirs.proposals}/${date} ${String(i + 1).padStart(2, "0")} ${slug(p.title, 70)}.md`;
    const evidenceUploads = uploads.filter((u) => evidence.includes(u.id));
    const st = supportOf(evidenceUploads);
    const disputes = (p.disputes ?? []).map((x) => validateDispute(x, byId)).filter((x): x is Dispute => !!x);
    const invalid = (p.disputes ?? []).length - disputes.length;
    if (invalid > 0) dropped.push(`"${p.title}": ${invalid} dispute(s) without evidence from different people on both sides dropped`);
    const props = {
      type: "proposal",
      brand: svc.cfg.brand.name,
      title: p.title,
      section: sectionRef(s),
      change: p.change,
      status: "open",
      approved_by: "",
      created: date,
      digest: week,
      evidence: evidenceUploads.map((u) => wikilink(uploadNotePath(v, u.id).replace(/\.md$/, ""))),
      image: evidenceUploads[0] ? wikilink(evidenceUploads[0].image) : undefined,
      base_hash: hash(old),
      // support: sortable in Bases
      support_people: st.people.length,
      support_refs: st.refs,
      supporters: st.people,
      single_voice: st.singleVoice,
      disputed: disputes.length,
      dispute_resolved: disputes.length ? false : undefined,
      tags: ["tasteloop/proposal", ...(st.singleVoice ? ["tasteloop/single-voice"] : []), ...(disputes.length ? ["tasteloop/disputed"] : [])],
    };
    const approval = svc.cfg.approvers.length
      ? `To approve, set \`status\` to \`approved\` and \`approved_by\` to your name (${svc.cfg.approvers.join(" or ")}). To reject: \`status: rejected\`.`
      : "To approve, set `status` to `approved`. To reject: `status: rejected`.";
    const body = `# ${p.title}

> [!question] Approval
> ${approval} You may edit the text between the markers below first. Approved proposals are applied on the next run (every 10 minutes).

**Section:** ${sectionRef(s)} · **Change:** ${p.change} · **Guide:** [[${v.guidePath.replace(/\.md$/, "")}]]

**Support:** ${supportText(st)} (${st.people.join(", ")})
${st.singleVoice ? `\n> [!note] Single voice\n> Only ${st.people[0]} supports this proposal. It stays, but deserves a conscious decision.\n` : ""}${
      disputes.length
        ? `
> [!warning] Disputed
> People contradict each other here. It is not applied until someone resolves it: adjust the text below, then set \`dispute_resolved: true\` and approve.

## Disputed

${disputes.map((x) => `### ${x.point}\n\n- **For:** ${side(v, x.for)}\n- **Against:** ${side(v, x.against)}\n\n${[...x.for, ...x.against].map((u) => `![[${u.image}|160]]`).join(" ")}`).join("\n\n")}
`
        : ""
    }
## Reasoning

${p.reasoning}

## Diff

\`\`\`diff
${renderDiff(old, next)}
\`\`\`

## New text

${NEW_TEXT_START}
${p.new_text.trim()}
${NEW_TEXT_END}

## Evidence

${evidenceUploads
  .map((u) => `![[${u.image}|240]]\n[[${uploadNotePath(v, u.id).replace(/\.md$/, "")}|${u.id}]] from ${u.sender}: ${u.analysis?.summary ?? ""}`)
  .join("\n\n")}
`;
    v.writeText(path, stringifyMd({ props, body }));
    created.push(path);
    details.push({ path, title: p.title, people: st.people.length, refs: st.refs, singleVoice: st.singleVoice, disputed: disputes.length });
  });

  const disputesWithout = (data.disputes_without_proposal ?? []).map((x) => validateDispute(x, byId)).filter((x): x is Dispute => !!x);
  const digestPath = `${v.dirs.proposals}/${date} Weekly digest ${week}.md`;
  const digestBody = `# Weekly digest ${week}

${data.summary}

## Proposals

${details.length ? details.map((d) => `- [[${d.path.replace(/\.md$/, "")}]]: ${supportText(d)}${d.singleVoice ? " · single voice" : ""}${d.disputed ? ` · disputed (${d.disputed})` : ""}`).join("\n") : "- (none)"}

## Disputed without a proposal

People contradict each other here, but no proposal was made. None of it becomes a rule until someone decides.

${disputesWithout.length ? disputesWithout.map((x) => `- **${x.point}:** for ${side(v, x.for)}; against ${side(v, x.against)}`).join("\n") : "- (none)"}

## Core notes (locked, manual only)

These observations concern locked core sections. Tasteloop never changes them; a person decides.

${core.length ? core.map((k) => `- **${k.section}:** ${k.note}${k.evidence.length ? ` (evidence: ${k.evidence.join(", ")})` : ""}`).join("\n") : "- (none)"}

## Uploads read

${uploads.map((u) => `- [[${uploadNotePath(v, u.id).replace(/\.md$/, "")}|${u.id}]] from ${u.sender}`).join("\n")}
${dropped.length ? `\n## Dropped (automatically)\n\n${dropped.map((x) => `- ${x}`).join("\n")}\n` : ""}`;
  v.writeText(
    digestPath,
    stringifyMd({
      props: { type: "digest", brand: svc.cfg.brand.name, week, created: date, proposals: created.length, people: peopleTotal, disputes_without_proposal: disputesWithout.length, core_notes: core.length, tags: ["tasteloop/digest"] },
      body: digestBody,
    }),
  );

  for (const u of uploads) {
    u.digest = digestPath;
    u.status = "in_digest";
    writeUpload(v, u);
  }
  svc.log.info("Digest written", { week, proposals: created.length, core: core.length, input: usage.inputTokens, output: usage.outputTokens, costUsd: costUsd(usage) });
  return { proposals: created, details, disputesWithoutProposal: disputesWithout.length, coreNotes: core.length, uploads: uploads.length, digestNote: digestPath, costUsd: costUsd(usage), dropped };
}

export function digestChatText(svc: Services, r: DigestResult): string {
  if (!r.uploads) return "🗓 Weekly digest: no new brand uploads this week.";
  const lines = [
    `🗓 Weekly digest: ${r.uploads} new brand uploads, ${r.proposals.length} ${r.proposals.length === 1 ? "proposal" : "proposals"}${r.coreNotes ? `, ${r.coreNotes} core notes` : ""}.`,
    ...r.details.map((d) => `• ${d.title} (${supportText(d)}${d.singleVoice ? ", single voice" : ""}${d.disputed ? ", ⚠️ disputed" : ""})`),
    ...(r.disputesWithoutProposal ? [`⚠️ ${r.disputesWithoutProposal} more ${r.disputesWithoutProposal === 1 ? "point" : "points"} where you disagree (see the digest).`] : []),
    `Approve in Obsidian: folder "${svc.vault.dirs.proposals}", property status: approved.`,
  ];
  if (svc.cfg.web.url) lines.push(`View: ${svc.cfg.web.url.replace(/\/$/, "")}/proposals`);
  return lines.join("\n");
}
