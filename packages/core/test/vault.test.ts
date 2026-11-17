import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { suggestLevel } from "../src/level";
import { removeCanvasImage, upsertCanvasImage } from "../src/vault/canvas";
import { parseUpload, renderUpload, type Upload } from "../src/vault/uploads";
import { ANALYSE_FIXTURE, makeVault } from "./helpers";

const base: Upload = {
  id: "20261112-1530-abcd",
  marke: "Testmarke",
  ebene: "brand",
  vorgeschlageneEbene: "brand",
  absender: "Anna",
  datum: "2026-11-12T15:30:00",
  status: "analysiert",
  bild: "Marke/Brand-System/Uploads/Bilder/20261112-1530-abcd.jpg",
  begruendung: "Zeile eins\nZeile zwei",
  transkript: ["Erstes Transkript.", "Zweites."],
  korrekturen: [{ zeit: "2026-11-12T15:40:00", absender: "Ben", text: "Licht statt Farbe" }],
  analyse: ANALYSE_FIXTURE,
  extraSections: [],
};

describe("Upload-Notiz", () => {
  it("lässt sich verlustfrei schreiben und lesen", () => {
    const back = parseUpload(renderUpload(base));
    expect(back).toEqual({ ...base, briefing: undefined, digest: undefined, fehler: undefined, telegramNachricht: undefined });
  });
  it("erhält vom Menschen ergänzte Abschnitte", () => {
    const text = renderUpload(base) + "\n## Meine Notizen\n\nNicht löschen!\n";
    const u = parseUpload(text);
    expect(u.extraSections).toEqual([{ key: "Meine Notizen", text: "Nicht löschen!" }]);
    expect(renderUpload(u)).toContain("## Meine Notizen\n\nNicht löschen!");
  });
});

describe("Moodboard-Canvas", () => {
  it("fügt hinzu, verschiebt bei Ebenenwechsel, entfernt und lässt fremde Knoten in Ruhe", () => {
    const { vault, root } = makeVault();
    const file = join(root, vault.dirs.moodboard);
    const doc = JSON.parse(readFileSync(file, "utf8"));
    doc.nodes.push({ id: "mensch", type: "text", text: "Notiz von Hand", x: -500, y: -500, width: 200, height: 100 });
    writeFileSync(file, JSON.stringify(doc));
    for (let i = 0; i < 5; i++) upsertCanvasImage(vault, `id${i}`, `b${i}.jpg`, "brand");
    let c = JSON.parse(readFileSync(file, "utf8"));
    const pos = c.nodes.filter((n: { id: string }) => n.id.startsWith("upl-")).map((n: { x: number; y: number }) => `${n.x},${n.y}`);
    expect(new Set(pos).size).toBe(5); // keine Überlappung
    const g = c.nodes.find((n: { id: string }) => n.id === "grp-brand");
    expect(g.height).toBeGreaterThan(400); // Gruppe wächst mit
    upsertCanvasImage(vault, "id0", "b0.jpg", "kampagne");
    c = JSON.parse(readFileSync(file, "utf8"));
    const k = c.nodes.find((n: { id: string }) => n.id === "grp-kampagne");
    const n0 = c.nodes.find((n: { id: string }) => n.id === "upl-id0");
    expect(n0.x).toBeGreaterThanOrEqual(k.x);
    removeCanvasImage(vault, "id1");
    c = JSON.parse(readFileSync(file, "utf8"));
    expect(c.nodes.some((n: { id: string }) => n.id === "upl-id1")).toBe(false);
    expect(c.nodes.some((n: { id: string }) => n.id === "mensch")).toBe(true);
  });
});

describe("Bases-Galerie", () => {
  it("ist gültiges YAML mit Kartenansicht über die Bild-Property", () => {
    const { vault, root } = makeVault();
    const doc = parse(readFileSync(join(root, vault.dirs.galerie), "utf8"));
    expect(doc.filters.and[0]).toBe('file.inFolder("Marke/Brand-System/Uploads")');
    expect(doc.views[0]).toMatchObject({ type: "cards", image: "note.bild" });
    const v = parse(readFileSync(join(root, vault.dirs.vorschlaegeAnsicht), "utf8"));
    expect(v.views[0].filters.and).toContain('status == "offen"');
  });
});

describe("Ebenen-Vorschlag", () => {
  it.each([
    ["So eine Anzeige wollen wir für die Kampagne", "kampagne"],
    ["Die Farbwelt passt zu unserer Marke", "brand"],
    ["nur merken, für später", "merken"],
    ["schön", undefined],
    ["", undefined],
  ])("%s -> %s", (text, ebene) => {
    expect(suggestLevel(text)).toBe(ebene);
  });
});
