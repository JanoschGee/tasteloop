/**
 * Public template (templates/brand-guide.md) with the example config (brands/example.yaml):
 * lock via frontmatter, learning area, locked tokens, changelog row, version, brief blocks.
 * Guarantees: whoever starts from template and example gets a working system.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { parseBrandConfig, type BrandConfig } from "../src/config";
import { parseMd, stringifyMd } from "../src/frontmatter";
import { lockRules, sectionIndex } from "../src/guide/context";
import { applyChange, assertGuideIntegrity, findSection, isEditable, isLocked, LockedSectionError, missingLocks, parseGuide } from "../src/guide/sections";
import { analyseUpload } from "../src/jobs/analyse";
import { runApply } from "../src/jobs/apply";
import { readPromptBlocks } from "../src/jobs/briefing";
import { runDigest } from "../src/jobs/digest";
import { silentLogger } from "../src/log";
import type { Services } from "../src/services";
import { ensureVaultStructure } from "../src/vault/bases";
import { listUploads, writeUpload } from "../src/vault/uploads";
import { Vault } from "../src/vault/vault";
import { ANALYSIS_FIXTURE, BRIEF_FIXTURE, FakeLlm, FakeTranscriber, TINY_JPEG } from "./helpers";

const REPO = resolve(__dirname, "../../..");
const GUIDE = readFileSync(join(REPO, "templates/brand-guide.md"), "utf8");

function setup() {
  const root = mkdtempSync(join(tmpdir(), "tl-template-"));
  const cfg: BrandConfig = parseBrandConfig(readFileSync(join(REPO, "brands/example.yaml"), "utf8"));
  cfg.vault.root = root;
  mkdirSync(join(root, ".obsidian"));
  const guidePath = join(root, cfg.guide.file);
  mkdirSync(dirname(guidePath), { recursive: true });
  writeFileSync(guidePath, GUIDE);
  writeFileSync(join(root, "Private.md"), "do not touch\n");
  const vault = new Vault(cfg);
  ensureVaultStructure(vault);
  const llm = new FakeLlm();
  const svc: Services = { cfg, vault, llm, transcriber: new FakeTranscriber(), log: silentLogger, now: () => new Date(2026, 10, 16, 8, 0, 0) };
  return { cfg, vault, llm, svc, root, guidePath };
}

const body = (ref: string) => {
  const g = parseGuide(GUIDE);
  const s = findSection(g, ref)!;
  return g.lines.slice(s.bodyStart, s.bodyEnd).join("\n");
};

describe("template and example config fit together", () => {
  it("all locks and learning sections exist in the template", () => {
    expect(missingLocks(GUIDE, lockRules(setup().vault))).toEqual([]);
  });

  it("the core is locked, only Part 2 learns", () => {
    const h = setup();
    const g = parseGuide(GUIDE);
    const r = lockRules(h.vault);
    const sec = (ref: string) => findSection(g, ref)!;
    expect(isLocked(sec("1. Core (locked)"), r, g)).toBe(true);
    expect(isLocked(sec("1.3 Never"), r, g)).toBe(true);
    expect(isEditable(sec("2.1 Colour"), r, g)).toBe(true);
    expect(isEditable(sec("2.5 Prompt building blocks"), r, g)).toBe(true);
    expect(isEditable(sec("How to use this guide"), r, g)).toBe(false);
    expect(isEditable(sec("3. References"), r, g)).toBe(false);
    expect(isEditable(sec("4. Changelog"), r, g)).toBe(false);
    expect(sectionIndex(h.vault, GUIDE)).toContain("2. Expression (learns) > 2.3 Imagery [editable]");
  });

  it("refuses the core, sections outside the learning area and locked colour tokens; the frontmatter lock can't be removed", () => {
    const r = lockRules(setup().vault);
    expect(() => applyChange(GUIDE, { section: "1.3 Never", change: "extend", text: "- anything" }, r)).toThrow(LockedSectionError);
    expect(() => applyChange(GUIDE, { section: "3. References", change: "replace", text: "x" }, r)).toThrow(LockedSectionError);
    expect(() => applyChange(GUIDE, { section: "2.1 Colour", change: "replace", text: body("2.1 Colour").replace("#111111", "#000000") }, r)).toThrow(/color\.ink/);
    expect(applyChange(GUIDE, { section: "2.1 Colour", change: "replace", text: body("2.1 Colour").replace("#E2231A", "#D91F16") }, r)).toContain("#D91F16");
    const unlocked = GUIDE.replace('locked: ["1. Core (locked)"]', "locked: []");
    expect(() => assertGuideIntegrity(GUIDE, unlocked, r, [])).toThrow(/frontmatter/i);
  });

  it("the gallery embed points to the file and view the system creates", () => {
    const h = setup();
    const m = /!\[\[([^\]#|]+\.base)#([^\]|]+)\]\]/.exec(GUIDE)!;
    expect(join(dirname(h.cfg.guide.file), m[1])).toBe(h.vault.dirs.gallery);
    const base = parse(h.vault.readText(h.vault.dirs.gallery));
    expect(base.views.map((v: { name: string }) => v.name)).toContain(m[2]);
    expect(GUIDE).toContain("`Tasteloop/Moodboard.canvas`");
  });

  it("reads the prompt building blocks from 2.5", () => {
    const { blocks, notes } = readPromptBlocks(GUIDE, "2.5 Prompt building blocks");
    expect(blocks.map((b) => b.name)).toEqual(["Film", "Light", "Colour", "Closing"]);
    expect(blocks[3].prompt).toBe("No text, no logos, no brand marks, no watermark.");
    expect(notes).toContain("Never in a prompt");
  });
});

describe("learning loop with the template", () => {
  it("applies an approval to Part 2: changelog row, version +1, updated = today", async () => {
    const h = setup();
    const image = `${h.vault.dirs.images}/u1.jpg`;
    h.vault.writeBytes(image, TINY_JPEG);
    writeUpload(h.vault, { id: "20261113-1000-aaaa", brand: "x", level: "brand", sender: "Sam", date: "2026-11-13T10:00:00", status: "analyzed", image, why: "Side light", transcript: [], corrections: [], analysis: ANALYSIS_FIXTURE, extraSections: [] });
    h.llm.queue("digest", {
      summary: "Side light.",
      proposals: [
        { title: "Side light", section: "2. Expression (learns) > 2.3 Imagery", change: "extend", new_text: "- **Direction:** light comes from the side.", reasoning: "b", evidence: ["20261113-1000-aaaa"], disputes: [] },
        { title: "Change purpose", section: "1.1 Purpose", change: "replace", new_text: "x", reasoning: "b", evidence: ["20261113-1000-aaaa"], disputes: [] },
      ],
      core_notes: [],
      disputes_without_proposal: [],
    });
    const r = await runDigest(h.svc);
    expect(r.proposals).toHaveLength(1);
    expect(r.coreNotes).toBe(1);
    const doc = parseMd(h.vault.readText(r.proposals[0]));
    Object.assign(doc.props, { status: "approved", approved_by: "Sam" });
    writeFileSync(join(h.root, r.proposals[0]), stringifyMd(doc));
    expect(runApply(h.svc)[0].status).toBe("applied");
    const after = readFileSync(h.guidePath, "utf8");
    const fm = parseMd(after).props;
    expect(fm.version).toBe(2);
    expect(fm.updated).toBe("2026-11-16");
    expect(fm.locked).toEqual(["1. Core (locked)"]);
    expect(after).toContain("- **Direction:** light comes from the side.");
    expect(after).toMatch(/\| 2026-11-16 \| 2\.3 Imagery \| Side light \(extended\) \| \[\[.*\\\|Proposal\]\] \| Sam \|/);
    expect(readFileSync(join(h.root, "Private.md"), "utf8")).toBe("do not touch\n");
  });

  it("the brief copies matching blocks word for word and appends the checklist from 2.6", async () => {
    const h = setup();
    const id = "20261113-1100-bbbb";
    const image = `${h.vault.dirs.images}/${id}.jpg`;
    h.vault.writeBytes(image, TINY_JPEG);
    writeUpload(h.vault, { id, brand: "x", level: "campaign", sender: "Alex", date: "2026-11-13T11:00:00", status: "new", image, why: "We want an ad like this", transcript: [], corrections: [], extraSections: [] });
    h.llm.queue("brief", { ...BRIEF_FIXTURE, prompt_blocks: ["Light", "Closing"] });
    await analyseUpload(h.svc, id);
    const text = h.vault.readText(listUploads(h.vault)[0].brief!);
    expect(text).toContain("| Closing | no text, no logos | `No text, no logos, no brand marks, no watermark.` |");
    expect(text).not.toContain("| Film |");
    expect(text).toContain("#### 2.6 Review checklist");
    expect(readFileSync(h.guidePath, "utf8")).toBe(GUIDE);
  });
});
