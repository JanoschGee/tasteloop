/**
 * Öffentliche Vorlage (templates/brand-guide.md) mit der Beispiel-Config (brands/example.yaml):
 * Sperre per Frontmatter, Lernbereich, gesperrte Tokens, Protokollzeile, Version, Briefing-Bausteine.
 * Damit ist garantiert: Wer mit Vorlage und Beispiel startet, bekommt ein funktionierendes System.
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
import { readBausteine } from "../src/jobs/briefing";
import { runDigest } from "../src/jobs/digest";
import { silentLogger } from "../src/log";
import type { Services } from "../src/services";
import { ensureVaultStructure } from "../src/vault/bases";
import { listUploads, writeUpload } from "../src/vault/uploads";
import { Vault } from "../src/vault/vault";
import { ANALYSE_FIXTURE, BRIEFING_FIXTURE, FakeLlm, FakeTranscriber, TINY_JPEG } from "./helpers";

const REPO = resolve(__dirname, "../../..");
const GUIDE = readFileSync(join(REPO, "templates/brand-guide.md"), "utf8");

function setup() {
  const root = mkdtempSync(join(tmpdir(), "tl-template-"));
  const cfg: BrandConfig = parseBrandConfig(readFileSync(join(REPO, "brands/example.yaml"), "utf8"));
  cfg.vault.wurzel = root;
  mkdirSync(join(root, ".obsidian"));
  const guidePath = join(root, cfg.brand_guide.datei);
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

describe("Vorlage und Beispiel-Config passen zusammen", () => {
  it("alle Sperren und Lernbereiche existieren in der Vorlage", () => {
    expect(missingLocks(GUIDE, lockRules(setup().vault))).toEqual([]);
  });

  it("Kern gesperrt, nur Teil 2 lernt", () => {
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
    expect(isEditable(sec("4. Change log"), r, g)).toBe(false);
    expect(sectionIndex(h.vault, GUIDE)).toContain("2. Expression (learns) > 2.3 Imagery [bearbeitbar]");
  });

  it("verweigert Kern, Bereiche außerhalb und gesperrte Farb-Tokens; Frontmatter-Sperre lässt sich nicht entfernen", () => {
    const r = lockRules(setup().vault);
    expect(() => applyChange(GUIDE, { abschnitt: "1.3 Never", art: "ergaenzen", text: "- anything" }, r)).toThrow(LockedSectionError);
    expect(() => applyChange(GUIDE, { abschnitt: "3. References", art: "ersetzen", text: "x" }, r)).toThrow(LockedSectionError);
    expect(() => applyChange(GUIDE, { abschnitt: "2.1 Colour", art: "ersetzen", text: body("2.1 Colour").replace("#111111", "#000000") }, r)).toThrow(/color\.ink/);
    expect(applyChange(GUIDE, { abschnitt: "2.1 Colour", art: "ersetzen", text: body("2.1 Colour").replace("#E2231A", "#D91F16") }, r)).toContain("#D91F16");
    const unlocked = GUIDE.replace('locked: ["1. Core (locked)"]', "locked: []");
    expect(() => assertGuideIntegrity(GUIDE, unlocked, r, [])).toThrow(/Frontmatter/);
  });

  it("die Einbettung der Galerie zeigt auf die Datei und View, die das System anlegt", () => {
    const h = setup();
    const m = /!\[\[([^\]#|]+\.base)#([^\]|]+)\]\]/.exec(GUIDE)!;
    expect(join(dirname(h.cfg.brand_guide.datei), m[1])).toBe(h.vault.dirs.galerie);
    const base = parse(h.vault.readText(h.vault.dirs.galerie));
    expect(base.views.map((v: { name: string }) => v.name)).toContain(m[2]);
    expect(GUIDE).toContain("`Tasteloop/Moodboard.canvas`");
  });

  it("liest die Prompt-Bausteine aus 2.5", () => {
    const { bausteine, hinweise } = readBausteine(GUIDE, "2.5 Prompt building blocks");
    expect(bausteine.map((b) => b.name)).toEqual(["Film", "Light", "Colour", "Closing"]);
    expect(bausteine[3].prompt).toBe("No text, no logos, no brand marks, no watermark.");
    expect(hinweise).toContain("Never in a prompt");
  });
});

describe("Lernschleife mit der Vorlage", () => {
  it("übernimmt eine Freigabe in Teil 2: englische Protokollzeile, version +1, updated = heute", async () => {
    const h = setup();
    const bild = `${h.vault.dirs.bilder}/u1.jpg`;
    h.vault.writeBytes(bild, TINY_JPEG);
    writeUpload(h.vault, { id: "20261113-1000-aaaa", marke: "x", ebene: "brand", absender: "Sam", datum: "2026-11-13T10:00:00", status: "analysiert", bild, begruendung: "Side light", transkript: [], korrekturen: [], analyse: ANALYSE_FIXTURE, extraSections: [] });
    h.llm.queue("digest", {
      zusammenfassung: "Side light.",
      vorschlaege: [
        { titel: "Side light", abschnitt: "2. Expression (learns) > 2.3 Imagery", art: "ergaenzen", neuer_text: "- **Direction:** light comes from the side.", begruendung: "b", belege: ["20261113-1000-aaaa"], uneinig: [] },
        { titel: "Change purpose", abschnitt: "1.1 Purpose", art: "ersetzen", neuer_text: "x", begruendung: "b", belege: ["20261113-1000-aaaa"], uneinig: [] },
      ],
      kern_hinweise: [],
      uneinig_ohne_vorschlag: [],
    });
    const r = await runDigest(h.svc);
    expect(r.vorschlaege).toHaveLength(1);
    expect(r.kernHinweise).toBe(1);
    const doc = parseMd(h.vault.readText(r.vorschlaege[0]));
    Object.assign(doc.props, { status: "freigegeben", freigegeben_von: "Sam" });
    writeFileSync(join(h.root, r.vorschlaege[0]), stringifyMd(doc));
    expect(runApply(h.svc)[0].status).toBe("übernommen");
    const after = readFileSync(h.guidePath, "utf8");
    const fm = parseMd(after).props;
    expect(fm.version).toBe(2);
    expect(fm.updated).toBe("2026-11-16");
    expect(fm.locked).toEqual(["1. Core (locked)"]);
    expect(after).toContain("- **Direction:** light comes from the side.");
    expect(after).toMatch(/\| 2026-11-16 \| 2\.3 Imagery \| Side light \(ergänzt\) \| \[\[.*\\\|Vorschlag\]\] \| Sam \|/);
    expect(readFileSync(join(h.root, "Private.md"), "utf8")).toBe("do not touch\n");
  });

  it("Briefing nimmt passende Bausteine wörtlich und die Prüfliste aus 2.6", async () => {
    const h = setup();
    const id = "20261113-1100-bbbb";
    const bild = `${h.vault.dirs.bilder}/${id}.jpg`;
    h.vault.writeBytes(bild, TINY_JPEG);
    writeUpload(h.vault, { id, marke: "x", ebene: "kampagne", absender: "Alex", datum: "2026-11-13T11:00:00", status: "neu", bild, begruendung: "We want an ad like this", transkript: [], korrekturen: [], extraSections: [] });
    h.llm.queue("briefing", { ...BRIEFING_FIXTURE, prompt_bausteine: ["Light", "Closing"] });
    await analyseUpload(h.svc, id);
    const text = h.vault.readText(listUploads(h.vault)[0].briefing!);
    expect(text).toContain("| Closing | no text, no logos | `No text, no logos, no brand marks, no watermark.` |");
    expect(text).not.toContain("| Film |");
    expect(text).toContain("#### 2.6 Review checklist");
    expect(readFileSync(h.guidePath, "utf8")).toBe(GUIDE);
  });
});
