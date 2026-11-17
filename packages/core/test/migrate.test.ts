/**
 * migrate-en: an old German config and vault become English without losing anything.
 * The brand guide is never touched, and a German guide keeps working with the English system.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { ConfigError, loadBrandConfig, parseBrandConfig } from "../src/config";
import { parseMd } from "../src/frontmatter";
import { lockRules } from "../src/guide/context";
import { missingLocks } from "../src/guide/sections";
import { runApply } from "../src/jobs/apply";
import { readPromptBlocks } from "../src/jobs/briefing";
import { silentLogger } from "../src/log";
import { migrate, migrateCanvas, migrateNote } from "../src/migrate";
import type { Services } from "../src/services";
import { listUploads, readUpload } from "../src/vault/uploads";
import { Vault } from "../src/vault/vault";
import { FakeLlm, FakeTranscriber, fixture, TINY_JPEG } from "./helpers";

const L = (f: string) => fixture(`legacy/${f}`);
const F = "Marke/Brand-Inbox";

function legacyVault() {
  const root = mkdtempSync(join(tmpdir(), "tl-legacy-"));
  mkdirSync(join(root, ".obsidian"));
  const w = (rel: string, text: string | Buffer) => {
    mkdirSync(join(root, rel, ".."), { recursive: true });
    writeFileSync(join(root, rel), text);
  };
  w("Marke/Guide.md", L("guide-de.md"));
  w(`${F}/Uploads/20261110-1000-aaa1.md`, L("upload-de.md"));
  w(`${F}/Uploads/Bilder/20261110-1000-aaa1.jpg`, TINY_JPEG);
  w(`${F}/Vorschläge/2026-11-16 01 Seitenlicht als Regel.md`, L("proposal-de.md"));
  w(`${F}/Vorschläge/2026-11-16 Wochen-Digest 2026-W47.md`, "---\ntyp: digest\nmarke: Altmarke\nwoche: 2026-W47\nerstellt: 2026-11-16\nvorschlaege: 1\nkern_hinweise: 0\ntags:\n  - brand-system/digest\n---\n\n# Wochen-Digest\n");
  w(`${F}/Briefings/20261110-1000-aaa1 Briefing.md`, "---\ntyp: briefing\nmarke: Altmarke\ntitel: Winter\nquelle: \"[[x]]\"\nreferenzbild: \"[[Marke/Brand-Inbox/Uploads/Bilder/20261110-1000-aaa1.jpg]]\"\nabsender: Anna\nerstellt: 2026-11-10\nstatus: offen\ntags:\n  - brand-system/briefing\n---\n\n# Winter\n");
  w(`${F}/Änderungslog.md`, "---\ntyp: aenderungslog\n---\n\n# Änderungslog Brand Guide\n\n<!-- einträge -->\n");
  w(`${F}/Galerie.base`, 'filters:\n  and:\n    - typ == "upload"\nviews:\n  - type: cards\n    name: Brand\n    image: note.bild\n');
  w(`${F}/Vorschläge.base`, 'filters:\n  and:\n    - status == "offen"\nviews: []\n');
  w(
    `${F}/Moodboard.canvas`,
    JSON.stringify({ nodes: [{ id: "grp-kampagne", type: "group", label: "Kampagne", x: 0, y: 0, width: 10, height: 10 }, { id: "grp-merken", type: "group", label: "Nur merken", x: 0, y: 0, width: 10, height: 10 }, { id: "human", type: "text", text: "von Hand", x: 1, y: 1, width: 1, height: 1 }], edges: [] }),
  );
  const cfgDir = mkdtempSync(join(tmpdir(), "tl-legacy-cfg-"));
  const cfgPath = join(cfgDir, "altmarke.yaml");
  writeFileSync(cfgPath, L("config-de.yaml").replace("/replaced/in/test", root));
  return { root, cfgPath, backupRoot: mkdtempSync(join(tmpdir(), "tl-backup-")) };
}

function snapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (rel: string) => {
    for (const n of readdirSync(join(root, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${n.name}` : n.name;
      if (n.isDirectory()) walk(r);
      else out[r] = readFileSync(join(root, r), "latin1");
    }
  };
  walk("");
  return out;
}

describe("old config is recognised", () => {
  it("the English loader points to migrate-en", () => {
    expect(() => parseBrandConfig(L("config-de.yaml"), "old.yaml")).toThrow(ConfigError);
    expect(() => parseBrandConfig(L("config-de.yaml"), "old.yaml")).toThrow(/npm run migrate-en/);
  });
});

describe("dry run", () => {
  it("lists what would change and changes nothing", () => {
    const h = legacyVault();
    const before = snapshot(h.root);
    const cfgBefore = readFileSync(h.cfgPath, "utf8");
    const r = migrate({ configPath: h.cfgPath, apply: false, backupRoot: h.backupRoot });
    expect(r.configChanged).toBe(true);
    expect(r.applied).toBe(false);
    expect(r.files.map((f) => f.kind).sort()).toEqual(["base", "base", "brief", "canvas", "changelog", "digest", "proposal", "upload"]);
    expect(r.files.some((f) => f.path.endsWith("Guide.md"))).toBe(false);
    expect(snapshot(h.root)).toEqual(before);
    expect(readFileSync(h.cfgPath, "utf8")).toBe(cfgBefore);
    expect(readdirSync(h.backupRoot)).toEqual([]);
  });
});

describe("apply", () => {
  function migrated() {
    const h = legacyVault();
    const guideBefore = readFileSync(join(h.root, "Marke/Guide.md"), "utf8");
    const r = migrate({ configPath: h.cfgPath, apply: true, backupRoot: h.backupRoot, now: new Date(2026, 10, 17, 9, 0, 0) });
    const cfg = loadBrandConfig(h.cfgPath);
    return { ...h, r, cfg, vault: new Vault(cfg), guideBefore };
  }

  it("converts the config to English keys and keeps every value and the old folder names", () => {
    const { cfg, r, root } = migrated();
    expect(r.applied).toBe(true);
    expect(cfg.brand).toEqual({ id: "altmarke", name: "Altmarke" });
    expect(cfg.language).toBe("de");
    expect(cfg.channels).toEqual(["telegram"]);
    expect(cfg.telegram.senders).toEqual({ "111": "Anna", "222": "Ben" });
    expect(cfg.vault).toMatchObject({ root, folder: F });
    expect(cfg.vault.subfolders).toEqual({
      uploads: "Uploads",
      images: "Uploads/Bilder",
      proposals: "Vorschläge",
      briefs: "Briefings",
      gallery: "Galerie.base",
      proposals_view: "Vorschläge.base",
      moodboard: "Moodboard.canvas",
      changelog: "Änderungslog.md",
    });
    expect(cfg.guide).toMatchObject({
      file: "Marke/Guide.md",
      locked_key: "gesperrt",
      learning: ["2. Ausdruck (lernt)"],
      locked_tokens: ["`color.base`"],
      changelog_section: "4. Änderungsprotokoll",
      date_key: "stand",
      brief_blocks: "2.2 Prompt-Bausteine",
      brief_appendix: ["2.3 Prüfliste"],
    });
    expect(cfg.approvers).toEqual(["Anna"]);
    expect(cfg.models).toEqual({ analysis: "claude-sonnet-5-5", digest: "claude-sonnet-5-5", brief: "claude-sonnet-5-5" });
    expect(cfg.transcription.local.enabled).toBe(false);
    expect(cfg.level_keywords).toEqual({ brand: ["marke"], campaign: ["anzeige"], keep: ["archiv"] });
  });

  it("converts notes without losing content; sections added by people stay", () => {
    const { vault } = migrated();
    const u = readUpload(vault, "20261110-1000-aaa1")!;
    expect(u).toMatchObject({ level: "brand", suggestedLevel: "brand", sender: "Anna", status: "analyzed", image: `${F}/Uploads/Bilder/20261110-1000-aaa1.jpg`, why: "Das Seitenlicht ist genau unser Look", messageId: 10 });
    expect(u.corrections).toEqual([{ time: "2026-11-10T10:05:00", sender: "Ben", text: "Eher das Licht als die Farbe" }]);
    expect(u.analysis).toMatchObject({ summary: "Paar am Tisch im warmen Licht.", likes: ["Warmes Seitenlicht"], dislikes: [], brand_fit: "Stützt die Bildwelt.", level_suggestion: "brand", keywords: ["warm", "analog"] });
    expect(u.analysis!.style).toMatchObject({ color: ["Off-White", "Terrakotta"], light: ["Seitenlicht"] });
    expect(u.extraSections).toEqual([{ key: "Meine Notiz", text: "Bleibt bitte stehen." }]);
    const raw = parseMd(vault.readText(`${F}/Uploads/20261110-1000-aaa1.md`)).props;
    expect(raw.tags).toEqual(["tasteloop/upload"]);
    expect(Object.keys(raw)).not.toContain("absender");

    const p = parseMd(vault.readText(`${F}/Vorschläge/2026-11-16 01 Seitenlicht als Regel.md`));
    expect(p.props).toMatchObject({ type: "proposal", title: "Seitenlicht als Regel", section: "2. Ausdruck (lernt) > 2.1 Farbe", change: "extend", status: "approved", approved_by: "Anna", base_hash: "a1b2c3d4e5f60718", support_people: 1, single_voice: true, disputed: 0 });
    expect(p.props.tags).toEqual(["tasteloop/proposal", "tasteloop/single-voice"]);
    expect(p.body).toContain("<!-- new-text:start -->\n- Licht kommt warm von der Seite.\n<!-- new-text:end -->");
    expect(p.body).toContain("## Reasoning\n\nAnna mag das Seitenlicht.");

    expect(parseMd(vault.readText(`${F}/Vorschläge/2026-11-16 Wochen-Digest 2026-W47.md`)).props).toMatchObject({ type: "digest", week: "2026-W47", proposals: 1, core_notes: 0 });
    expect(parseMd(vault.readText(`${F}/Briefings/20261110-1000-aaa1 Briefing.md`)).props).toMatchObject({ type: "brief", title: "Winter", reference: `[[${F}/Uploads/Bilder/20261110-1000-aaa1.jpg]]`, status: "open" });
    expect(parseMd(vault.readText(`${F}/Änderungslog.md`)).props.type).toBe("changelog");
    const canvas = JSON.parse(vault.readText(`${F}/Moodboard.canvas`));
    expect(canvas.nodes.map((n: { id: string }) => n.id)).toEqual(["grp-campaign", "grp-keep", "human"]);
    expect(parse(vault.readText(`${F}/Galerie.base`)).views.map((v: { name: string }) => v.name)).toContain("Brand");
  });

  it("never touches the guide and makes a backup of folder and config first", () => {
    const { root, guideBefore, r, cfgPath } = migrated();
    expect(readFileSync(join(root, "Marke/Guide.md"), "utf8")).toBe(guideBefore);
    expect(existsSync(join(r.backupDir!, "altmarke.yaml"))).toBe(true);
    expect(readFileSync(join(r.backupDir!, "altmarke.yaml"), "utf8")).toContain("marke:");
    expect(existsSync(join(r.backupDir!, "vault-folder", "Uploads", "20261110-1000-aaa1.md"))).toBe(true);
    expect(readFileSync(join(r.backupDir!, "vault-folder", "Uploads", "20261110-1000-aaa1.md"), "utf8")).toContain("absender: Anna");
    expect(readFileSync(cfgPath, "utf8")).toContain("converted to English keys by migrate-en");
  });

  it("is idempotent: a second run has nothing to do", () => {
    const { cfgPath, backupRoot, root } = migrated();
    const before = snapshot(root);
    const again = migrate({ configPath: cfgPath, apply: true, backupRoot });
    expect(again.configChanged).toBe(false);
    expect(again.files).toEqual([]);
    expect(again.applied).toBe(false);
    expect(snapshot(root)).toEqual(before);
  });
});

describe("a German guide with the English system", () => {
  it("the lock (frontmatter list), learning area, blocks and checklist work with German headings", () => {
    const h = legacyVault();
    migrate({ configPath: h.cfgPath, apply: true, backupRoot: h.backupRoot });
    const v = new Vault(loadBrandConfig(h.cfgPath));
    const guide = v.readText(v.guidePath);
    expect(missingLocks(guide, lockRules(v))).toEqual([]);
    expect(readPromptBlocks(guide, "2.2 Prompt-Bausteine").blocks).toEqual([{ name: "Licht", meaning: "warm", prompt: "Warm side light." }]);
  });

  it("applies a migrated approved proposal: German changelog row, version +1, stand = today, core untouched", () => {
    const h = legacyVault();
    migrate({ configPath: h.cfgPath, apply: true, backupRoot: h.backupRoot });
    const cfg = loadBrandConfig(h.cfgPath);
    const v = new Vault(cfg);
    const svc: Services = { cfg, vault: v, llm: new FakeLlm(), transcriber: new FakeTranscriber(), log: silentLogger, now: () => new Date(2026, 10, 18, 9, 0, 0) };
    const res = runApply(svc);
    expect(res[0]).toMatchObject({ status: "applied", title: "Seitenlicht als Regel" });
    const after = v.readText(v.guidePath);
    expect(after).toContain("- Rot ist ein Akzent.\n\n- Licht kommt warm von der Seite.");
    expect(after).toMatch(/\| 2026-11-18 \| 2\.1 Farbe \| Seitenlicht als Regel \(extended\) \| \[\[.*\\\|Proposal\]\] \| Anna \|/);
    const fm = parseMd(after).props;
    expect(fm.version).toBe(4);
    expect(fm.stand).toBe("2026-11-18");
    expect(fm.gesperrt).toEqual(["1. Kern (gesperrt)"]);
    expect(after).toContain("### 1.1 Leitbild\nWir zeigen echte Menschen.");
    expect(v.readText(`${F}/Änderungslog.md`)).toContain("<!-- einträge -->\n- 2026-11-18 09:00: **Seitenlicht als Regel**");
    expect(listUploads(v)).toHaveLength(1);
  });

  it("a proposal bent to the German core is refused", () => {
    const h = legacyVault();
    migrate({ configPath: h.cfgPath, apply: true, backupRoot: h.backupRoot });
    const cfg = loadBrandConfig(h.cfgPath);
    const v = new Vault(cfg);
    const p = `${F}/Vorschläge/2026-11-16 01 Seitenlicht als Regel.md`;
    v.writeText(p, v.readText(p).replace("section: 2. Ausdruck (lernt) > 2.1 Farbe", "section: 1.1 Leitbild"));
    const before = v.readText(v.guidePath);
    const svc: Services = { cfg, vault: v, llm: new FakeLlm(), transcriber: new FakeTranscriber(), log: silentLogger, now: () => new Date() };
    expect(runApply(svc)[0].status).toBe("locked");
    expect(v.readText(v.guidePath)).toBe(before);
  });
});

describe("single helpers", () => {
  it("leaves English and unknown notes alone", () => {
    const en = "---\ntype: upload\nid: x\n---\n\n## Why\n\n> hi\n";
    expect(migrateNote(en).text).toBe(en);
    const other = "---\nfoo: bar\n---\n\nhello\n";
    expect(migrateNote(other).text).toBe(other);
    expect(migrateCanvas("not json")).toBe("not json");
  });
});
