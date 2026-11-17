/**
 * Several contributors (the core of the product): support, disputes, single voice.
 * Fixtures with three senders: Anna, Ben, Cem.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { parseMd, stringifyMd } from "../src/frontmatter";
import { runApply } from "../src/jobs/apply";
import { digestChatText, runDigest, supportOf, supportText, validateDispute } from "../src/jobs/digest";
import { writeUpload, type Upload } from "../src/vault/uploads";
import { ANALYSIS_FIXTURE, makeServices, TINY_JPEG } from "./helpers";

type H = ReturnType<typeof makeServices>;

function seed(h: H, id: string, sender: string, why: string): Upload {
  const image = `${h.vault.dirs.images}/${id}.jpg`;
  h.vault.writeBytes(image, TINY_JPEG);
  const u: Upload = { id, brand: "Testbrand", level: "brand", sender, date: `2026-11-1${id.slice(-1)}T10:00:00`, status: "analyzed", image, why, transcript: [], corrections: [], analysis: ANALYSIS_FIXTURE, extraSections: [] };
  writeUpload(h.vault, u);
  return u;
}

// agreement: Anna (2x) and Ben praise warm side light
// dispute: Anna praises film grain, Cem criticises it
// single voice: only Cem wants a serif for headlines
const A1 = "20261110-1000-ann1";
const A2 = "20261111-1000-ann2";
const A3 = "20261112-1000-ann3";
const B1 = "20261113-1000-ben1";
const C1 = "20261114-1000-cem1";
const C2 = "20261115-1000-cem2";

function prepare() {
  const h = makeServices({ now: new Date(2026, 10, 17, 8, 0, 0) });
  seed(h, A1, "Anna", "That warm side light, exactly");
  seed(h, A2, "Anna", "Light from the side again");
  seed(h, A3, "Anna", "The grain makes it real");
  seed(h, B1, "Ben", "Warm light, I like it");
  seed(h, C1, "Cem", "Too much grain, looks dirty");
  seed(h, C2, "Cem", "A serif for headlines would be nice");
  return h;
}

const DIGEST = {
  summary: "Three people, a clear pattern in the light, a dispute about grain.",
  proposals: [
    {
      title: "Warm side light",
      section: "3. Look and Feel > Imagery",
      change: "extend" as const,
      new_text: "Light comes warm and from the side.",
      reasoning: "Anna and Ben independently.",
      evidence: [A1, A2, B1],
      // only one side: not a dispute, dropped
      disputes: [{ point: "How warm exactly", for: [A1], against: [] }],
    },
    {
      title: "Film grain",
      section: "3. Look and Feel > Colour",
      change: "extend" as const,
      new_text: "Light film grain is welcome.",
      reasoning: "Anna praises the grain.",
      evidence: [A3],
      disputes: [{ point: "Film grain", for: [A3], against: [C1] }],
    },
    {
      title: "Serif for headlines",
      section: "3. Look and Feel > Typography",
      change: "extend" as const,
      new_text: "Headlines may use a serif.",
      reasoning: "Cem would like it.",
      evidence: [C2],
      disputes: [],
    },
  ],
  core_notes: [],
  disputes_without_proposal: [
    { point: "How much red", for: [B1], against: [C2] },
    // the same person on both sides is not a dispute between people
    { point: "Anna with herself", for: [A1], against: [A2] },
  ],
};

const props = (h: H, p: string) => parseMd(h.vault.readText(p)).props;
const byTitle = (h: H, paths: string[], t: string) => paths.find((p) => props(h, p).title === t)!;

function approve(h: H, path: string, extra: Record<string, unknown> = {}) {
  const doc = parseMd(h.vault.readText(path));
  Object.assign(doc.props, { status: "approved", approved_by: "Anna" }, extra);
  writeFileSync(join(h.root, path), stringifyMd(doc));
}

describe("support", () => {
  it("counts different people, not images", () => {
    const us = [A1, A2, B1].map((id) => ({ id, sender: id.includes("ann") ? "Anna" : "Ben" }) as Upload);
    expect(supportOf(us)).toEqual({ people: ["Anna", "Ben"], refs: 3, singleVoice: false });
    expect(supportText({ people: 3, refs: 5 })).toBe("3 people, 5 references");
    expect(supportText({ people: 1, refs: 1 })).toBe("1 person, 1 reference");
  });

  it("is stored as sortable properties and as a line in the proposal", async () => {
    const h = prepare();
    h.llm.queue("digest", DIGEST);
    const r = await runDigest(h.svc);
    expect(r.proposals).toHaveLength(3);
    const light = byTitle(h, r.proposals, "Warm side light");
    expect(props(h, light)).toMatchObject({ support_people: 2, support_refs: 3, supporters: ["Anna", "Ben"], single_voice: false, disputed: 0 });
    expect(props(h, light).dispute_resolved).toBeUndefined();
    expect(h.vault.readText(light)).toContain("**Support:** 2 people, 3 references (Anna, Ben)");
    const base = parse(h.vault.readText(h.vault.dirs.proposalsView));
    expect(base.views[0].sort[0]).toEqual({ property: "note.support_people", direction: "DESC" });
    expect(base.views.map((v: { name: string }) => v.name)).toContain("Disputed");
    expect((h.llm.calls[0].content[1] as { text: string }).text).toContain("from 3 people");
  });
});

describe("disputes", () => {
  it("shows contradictions with evidence from both sides and drops fake ones", async () => {
    const h = prepare();
    h.llm.queue("digest", DIGEST);
    const r = await runDigest(h.svc);
    const grain = byTitle(h, r.proposals, "Film grain");
    const text = h.vault.readText(grain);
    expect(props(h, grain)).toMatchObject({ disputed: 1, dispute_resolved: false });
    expect(props(h, grain).tags).toContain("tasteloop/disputed");
    expect(text).toContain("## Disputed");
    expect(text).toContain("### Film grain");
    expect(text).toMatch(/\*\*For:\*\* \[\[[^\]]*ann3\|20261112-1000-ann3\]\] \(Anna\)/);
    expect(text).toMatch(/\*\*Against:\*\* \[\[[^\]]*cem1\|20261114-1000-cem1\]\] \(Cem\)/);
    expect(text).toContain(`![[${h.vault.dirs.images}/${C1}.jpg|160]]`);
    expect(props(h, byTitle(h, r.proposals, "Warm side light")).disputed).toBe(0);
    expect(r.dropped.join()).toContain("Warm side light");
    expect(r.disputesWithoutProposal).toBe(1);
    const digest = h.vault.readText(r.digestNote!);
    expect(digest).toContain("## Disputed without a proposal");
    expect(digest).toContain("**How much red:**");
    expect(digest).not.toContain("Anna with herself");
  });

  it("never becomes a rule quietly: applied only after dispute_resolved", async () => {
    const h = prepare();
    h.llm.queue("digest", DIGEST);
    const r = await runDigest(h.svc);
    const grain = byTitle(h, r.proposals, "Film grain");
    const guide = join(h.root, "Brand/Brand Guide.md");
    const before = readFileSync(guide, "utf8");
    approve(h, grain);
    expect(runApply(h.svc)[0].status).toBe("disputed");
    expect(readFileSync(guide, "utf8")).toBe(before);
    expect(props(h, grain).status).toBe("approved");
    approve(h, grain, { dispute_resolved: true });
    expect(runApply(h.svc)[0].status).toBe("applied");
    expect(readFileSync(guide, "utf8")).toContain("Light film grain is welcome.");
  });
});

describe("single voice", () => {
  it("is marked but not suppressed, and can be applied", async () => {
    const h = prepare();
    h.llm.queue("digest", DIGEST);
    const r = await runDigest(h.svc);
    const serif = byTitle(h, r.proposals, "Serif for headlines");
    expect(props(h, serif)).toMatchObject({ single_voice: true, support_people: 1, supporters: ["Cem"] });
    expect(props(h, serif).tags).toContain("tasteloop/single-voice");
    expect(h.vault.readText(serif)).toContain("> [!note] Single voice\n> Only Cem supports this proposal.");
    approve(h, serif);
    expect(runApply(h.svc)[0].status).toBe("applied");
  });

  it("the chat message names support, single voices and disputes", async () => {
    const h = prepare();
    h.llm.queue("digest", DIGEST);
    const t = digestChatText(h.svc, await runDigest(h.svc));
    expect(t).toContain("• Warm side light (2 people, 3 references)");
    expect(t).toContain("• Film grain (1 person, 1 reference, single voice, ⚠️ disputed)");
    expect(t).toContain("• Serif for headlines (1 person, 1 reference, single voice)");
    expect(t).toContain("1 more point where you disagree");
  });
});

describe("validateDispute", () => {
  it("needs two sides with different people", () => {
    const u = (id: string, a: string) => ({ id, sender: a }) as Upload;
    const m = new Map([u("a", "Anna"), u("b", "Ben"), u("a2", "Anna")].map((x) => [x.id, x]));
    expect(validateDispute({ point: "x", for: ["a"], against: ["b"] }, m)?.for.map((x) => x.id)).toEqual(["a"]);
    expect(validateDispute({ point: "x", for: ["a"], against: ["a2"] }, m)).toBeUndefined();
    expect(validateDispute({ point: "x", for: ["a"], against: ["made-up"] }, m)).toBeUndefined();
    expect(validateDispute({ point: "x", for: ["a", "b"], against: ["a2"] }, m)).toBeDefined();
  });
});
