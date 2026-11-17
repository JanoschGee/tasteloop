import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { suggestLevel } from "../src/level";
import { removeCanvasImage, upsertCanvasImage } from "../src/vault/canvas";
import { parseUpload, renderUpload, type Upload } from "../src/vault/uploads";
import { ANALYSIS_FIXTURE, makeVault } from "./helpers";

const base: Upload = {
  id: "20261112-1530-abcd",
  brand: "Testbrand",
  level: "brand",
  suggestedLevel: "brand",
  sender: "Anna",
  date: "2026-11-12T15:30:00",
  status: "analyzed",
  image: "Brand/Tasteloop/Uploads/Images/20261112-1530-abcd.jpg",
  why: "Line one\nLine two",
  transcript: ["First transcript.", "Second."],
  corrections: [{ time: "2026-11-12T15:40:00", sender: "Ben", text: "Light rather than colour" }],
  analysis: ANALYSIS_FIXTURE,
  extraSections: [],
};

describe("upload note", () => {
  it("round-trips without loss", () => {
    const back = parseUpload(renderUpload(base));
    expect(back).toEqual({ ...base, brief: undefined, digest: undefined, error: undefined, messageId: undefined });
  });
  it("keeps sections added by people", () => {
    const text = renderUpload(base) + "\n## My notes\n\nDo not delete!\n";
    const u = parseUpload(text);
    expect(u.extraSections).toEqual([{ key: "My notes", text: "Do not delete!" }]);
    expect(renderUpload(u)).toContain("## My notes\n\nDo not delete!");
  });
});

describe("moodboard canvas", () => {
  it("adds, moves on level change, removes, and leaves other nodes alone", () => {
    const { vault, root } = makeVault();
    const file = join(root, vault.dirs.moodboard);
    const doc = JSON.parse(readFileSync(file, "utf8"));
    doc.nodes.push({ id: "human", type: "text", text: "Hand-written note", x: -500, y: -500, width: 200, height: 100 });
    writeFileSync(file, JSON.stringify(doc));
    for (let i = 0; i < 5; i++) upsertCanvasImage(vault, `id${i}`, `b${i}.jpg`, "brand");
    let c = JSON.parse(readFileSync(file, "utf8"));
    const pos = c.nodes.filter((n: { id: string }) => n.id.startsWith("upl-")).map((n: { x: number; y: number }) => `${n.x},${n.y}`);
    expect(new Set(pos).size).toBe(5); // no overlap
    const g = c.nodes.find((n: { id: string }) => n.id === "grp-brand");
    expect(g.height).toBeGreaterThan(400); // the group grows
    upsertCanvasImage(vault, "id0", "b0.jpg", "campaign");
    c = JSON.parse(readFileSync(file, "utf8"));
    const k = c.nodes.find((n: { id: string }) => n.id === "grp-campaign");
    const n0 = c.nodes.find((n: { id: string }) => n.id === "upl-id0");
    expect(n0.x).toBeGreaterThanOrEqual(k.x);
    removeCanvasImage(vault, "id1");
    c = JSON.parse(readFileSync(file, "utf8"));
    expect(c.nodes.some((n: { id: string }) => n.id === "upl-id1")).toBe(false);
    expect(c.nodes.some((n: { id: string }) => n.id === "human")).toBe(true);
  });
});

describe("Bases gallery", () => {
  it("is valid YAML with a card view over the image property", () => {
    const { vault, root } = makeVault();
    const doc = parse(readFileSync(join(root, vault.dirs.gallery), "utf8"));
    expect(doc.filters.and).toEqual(['file.inFolder("Brand/Tasteloop/Uploads")', 'type == "upload"']);
    expect(doc.views[0]).toMatchObject({ type: "cards", name: "Gallery", image: "note.image" });
    expect(doc.views.map((v: { name: string }) => v.name)).toEqual(["Gallery", "Brand", "Campaign", "List"]);
    const v = parse(readFileSync(join(root, vault.dirs.proposalsView), "utf8"));
    expect(v.views[0].filters.and).toContain('status == "open"');
  });
});

describe("level suggestion", () => {
  it.each([
    ["We want an ad like this for the campaign", "campaign"],
    ["The colour palette fits our brand", "brand"],
    ["just keep this, for later", "keep"],
    ["So eine Anzeige wollen wir für die Kampagne", "campaign"],
    ["Die Farbwelt passt zu unserer Marke", "brand"],
    ["nur merken, für später", "keep"],
    ["nice", undefined],
    ["", undefined],
  ])("%s -> %s", (text, level) => {
    expect(suggestLevel(text)).toBe(level);
  });
});
