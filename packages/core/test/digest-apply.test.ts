/**
 * Learning loop: weekly digest -> proposal notes (diff, evidence) -> approval -> applied.
 * Core sections are never changed automatically.
 */
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMd, stringifyMd } from "../src/frontmatter";
import { analyseUpload } from "../src/jobs/analyse";
import { applyChatText, runApply } from "../src/jobs/apply";
import { digestChatText, isoWeek, NEW_TEXT_START, runDigest } from "../src/jobs/digest";
import { listUploads, writeUpload, type Upload } from "../src/vault/uploads";
import { ANALYSIS_FIXTURE, makeServices, TINY_JPEG } from "./helpers";

type H = ReturnType<typeof makeServices>;

function seedUpload(h: H, id: string, patch: Partial<Upload> = {}) {
  const image = `${h.vault.dirs.images}/${id}.jpg`;
  h.vault.writeBytes(image, TINY_JPEG);
  const u: Upload = {
    id,
    brand: "Testbrand",
    level: "brand",
    sender: "Anna",
    date: `2026-11-1${id.slice(-1)}T10:00:00`,
    status: "analyzed",
    image,
    why: "Warm and analogue",
    transcript: [],
    corrections: [],
    analysis: ANALYSIS_FIXTURE,
    extraSections: [],
    ...patch,
  };
  writeUpload(h.vault, u);
  return u;
}

const DIGEST = {
  summary: "Several uploads show warm side light and film grain.",
  proposals: [
    {
      title: "Film grain as a rule",
      section: "3. Look and Feel > Colour",
      change: "extend" as const,
      new_text: "Light film grain is welcome, never digitally smooth.",
      reasoning: "Two uploads praise the analogue grain.",
      evidence: ["20261110-1000-aaa1", "20261111-1000-aaa2", "made-up-123"],
      disputes: [],
    },
    {
      title: "Flip the purpose",
      section: "Purpose",
      change: "replace" as const,
      new_text: "We are quiet now.",
      reasoning: "One upload was quiet.",
      evidence: ["20261110-1000-aaa1"],
      disputes: [],
    },
    {
      title: "No evidence",
      section: "Address",
      change: "extend" as const,
      new_text: "We never use last names.",
      reasoning: "Gut feeling.",
      evidence: ["does-not-exist"],
      disputes: [],
    },
  ],
  core_notes: [],
  disputes_without_proposal: [],
};

function prepare() {
  const h = makeServices({ now: new Date(2026, 10, 16, 8, 0, 0) });
  seedUpload(h, "20261110-1000-aaa1");
  seedUpload(h, "20261111-1000-aaa2", { sender: "Ben" });
  seedUpload(h, "20261112-1000-bbb3", { level: "campaign" });
  seedUpload(h, "20261113-1000-ccc4", { status: "error" });
  return h;
}

function proposalPaths(h: H) {
  return readdirSync(join(h.root, h.vault.dirs.proposals))
    .filter((f) => f.endsWith(".md") && !f.includes("Weekly digest"))
    .map((f) => `${h.vault.dirs.proposals}/${f}`);
}

function approve(h: H, path: string, props: Record<string, unknown> = {}) {
  const doc = parseMd(h.vault.readText(path));
  Object.assign(doc.props, { status: "approved", approved_by: "Anna" }, props);
  writeFileSync(join(h.root, path), stringifyMd(doc));
}

const guidePath = (h: H) => join(h.root, "Brand/Brand Guide.md");

describe("weekly digest", () => {
  it("reads only new, analysed brand uploads and writes proposals with diff and evidence images", async () => {
    const h = prepare();
    h.llm.queue("digest", DIGEST);
    const r = await runDigest(h.svc);
    expect(r.uploads).toBe(2);
    expect(r.proposals).toHaveLength(1);
    const call = h.llm.calls[0];
    const text = call.content.map((c) => (c.type === "text" ? c.text : "")).join("\n");
    expect(text).toContain("- Purpose [locked]");
    expect(text).toContain("- 3. Look and Feel > Colour [editable]");
    expect(text).toContain('id="20261110-1000-aaa1"');
    expect(text).not.toContain("bbb3");
    expect(text).not.toContain("ccc4");
    expect(call.system).toContain("Write all text values in English.");

    const { props, body } = parseMd(h.vault.readText(r.proposals[0]));
    expect(props).toMatchObject({ type: "proposal", status: "open", section: "3. Look and Feel > Colour", change: "extend", approved_by: "", digest: isoWeek(new Date(2026, 10, 16)) });
    expect(props.evidence).toEqual(["[[Brand/Tasteloop/Uploads/20261110-1000-aaa1]]", "[[Brand/Tasteloop/Uploads/20261111-1000-aaa2]]"]);
    expect(body).toContain("```diff\n  Warm off-white as the base.\n  Terracotta as the accent.\n+ \n+ Light film grain is welcome, never digitally smooth.\n```");
    expect(body).toContain("![[Brand/Tasteloop/Uploads/Images/20261110-1000-aaa1.jpg|240]]");
    expect(body).toContain("approved_by");
    expect(body).toContain("## Reasoning");
    expect(body).toContain("## New text");
  });

  it("turns proposals for locked sections into core notes and drops unsupported ones", async () => {
    const h = prepare();
    h.llm.queue("digest", DIGEST);
    const r = await runDigest(h.svc);
    expect(r.coreNotes).toBe(1);
    expect(r.dropped.join()).toContain("No evidence");
    expect(proposalPaths(h).some((p) => p.includes("Purpose"))).toBe(false);
    const digest = h.vault.readText(r.digestNote!);
    expect(digest).toContain("## Core notes (locked, manual only)");
    expect(digest).toContain("**Purpose:** Flip the purpose");
  });

  it("marks uploads as read and does not read them again", async () => {
    const h = prepare();
    h.llm.queue("digest", DIGEST);
    await runDigest(h.svc);
    expect(listUploads(h.vault).find((u) => u.id === "20261110-1000-aaa1")!.status).toBe("in_digest");
    const r2 = await runDigest(h.svc);
    expect(r2.uploads).toBe(0);
    expect(h.llm.calls).toHaveLength(1);
    expect(digestChatText(h.svc, r2)).toContain("no new brand uploads");
  });

  it("the chat message names the count and titles", async () => {
    const h = prepare();
    h.llm.queue("digest", DIGEST);
    const t = digestChatText(h.svc, await runDigest(h.svc));
    expect(t).toContain("2 new brand uploads, 1 proposal, 1 core notes");
    expect(t).toContain("• Film grain as a rule");
  });

  it("re-analysing after the digest keeps the status in_digest", async () => {
    const h = prepare();
    h.llm.queue("digest", DIGEST);
    await runDigest(h.svc);
    expect((await analyseUpload(h.svc, "20261110-1000-aaa1")).upload.status).toBe("in_digest");
  });
});

describe("applying after approval", () => {
  async function withProposal() {
    const h = prepare();
    h.llm.queue("digest", DIGEST);
    await runDigest(h.svc);
    return { h, p: proposalPaths(h)[0] };
  }

  it("changes nothing without approval", async () => {
    const { h } = await withProposal();
    const before = readFileSync(guidePath(h), "utf8");
    expect(runApply(h.svc)).toEqual([]);
    expect(readFileSync(guidePath(h), "utf8")).toBe(before);
  });

  it("applies after status: approved, logs it and backs up the old version", async () => {
    const { h, p } = await withProposal();
    const before = readFileSync(guidePath(h), "utf8");
    approve(h, p);
    const backup = mkdtempSync(join(tmpdir(), "tl-backup-"));
    const res = runApply(h.svc, { backupDir: backup });
    expect(res).toHaveLength(1);
    expect(res[0].status).toBe("applied");
    const after = readFileSync(guidePath(h), "utf8");
    expect(after).toContain("Terracotta as the accent.\n\nLight film grain is welcome, never digitally smooth.\n\n### Typography");
    expect(readFileSync(join(backup, readdirSync(backup)[0]), "utf8")).toBe(before);
    const { props, body } = parseMd(h.vault.readText(p));
    expect(props.status).toBe("applied");
    expect(props.applied_at).toBe("2026-11-16T08:00:00");
    expect(body).toContain("## Log");
    expect(h.vault.readText(h.vault.dirs.changelog)).toContain('**Film grain as a rule** in "3. Look and Feel > Colour" (extend, approved by Anna)');
    expect(runApply(h.svc)).toEqual([]);
    expect(applyChatText(res)).toContain("✅ Film grain as a rule");
  });

  it("applies the text as edited by a person", async () => {
    const { h, p } = await withProposal();
    const doc = parseMd(h.vault.readText(p));
    doc.body = doc.body.replace(`${NEW_TEXT_START}\nLight film grain is welcome, never digitally smooth.`, `${NEW_TEXT_START}\nGrain: yes, but subtle.`);
    writeFileSync(join(h.root, p), stringifyMd(doc));
    approve(h, p);
    runApply(h.svc);
    expect(readFileSync(guidePath(h), "utf8")).toContain("Grain: yes, but subtle.");
  });

  it("requires approved_by from the approvers list", async () => {
    const { h, p } = await withProposal();
    const before = readFileSync(guidePath(h), "utf8");
    approve(h, p, { approved_by: "Ben" });
    expect(runApply(h.svc)[0].status).toBe("not_allowed");
    expect(readFileSync(guidePath(h), "utf8")).toBe(before);
    approve(h, p, { approved_by: "anna" });
    expect(runApply(h.svc)[0].status).toBe("applied");
  });

  it("CORE: a proposal bent to a locked section by hand never changes the guide", async () => {
    const { h, p } = await withProposal();
    const before = readFileSync(guidePath(h), "utf8");
    for (const section of ["Purpose", "1. Brand > Character", "What we never say", "Brand Guide Testbrand"]) {
      approve(h, p, { section, change: "replace", base_hash: undefined });
      expect(runApply(h.svc)[0].status, section).toBe("locked");
      expect(readFileSync(guidePath(h), "utf8"), section).toBe(before);
    }
    expect(h.vault.readText(h.vault.dirs.changelog)).not.toContain("Film grain");
  });

  it("CORE: text with an injected heading is refused", async () => {
    const { h, p } = await withProposal();
    const before = readFileSync(guidePath(h), "utf8");
    const doc = parseMd(h.vault.readText(p));
    doc.body = doc.body.replace(`${NEW_TEXT_START}\nLight film grain is welcome, never digitally smooth.`, `${NEW_TEXT_START}\nok\n\n## Purpose\n\nHijacked.`);
    writeFileSync(join(h.root, p), stringifyMd(doc));
    approve(h, p);
    expect(runApply(h.svc)[0].status).toBe("error");
    expect(readFileSync(guidePath(h), "utf8")).toBe(before);
  });

  it("detects conflicts when the section changed since the proposal (replace)", async () => {
    const { h, p } = await withProposal();
    approve(h, p, { change: "replace" });
    writeFileSync(guidePath(h), readFileSync(guidePath(h), "utf8").replace("Terracotta as the accent.", "Sage as the accent."));
    const before = readFileSync(guidePath(h), "utf8");
    expect(runApply(h.svc)[0].status).toBe("conflict");
    expect(readFileSync(guidePath(h), "utf8")).toBe(before);
  });

  it("writes nothing outside Tasteloop's folder and the guide", async () => {
    const { h, p } = await withProposal();
    approve(h, p);
    runApply(h.svc);
    expect(readFileSync(join(h.root, "Private.md"), "utf8")).toBe("This file is not part of Tasteloop.\n");
  });
});
