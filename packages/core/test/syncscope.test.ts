import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { excludeCommand, outsideScope, planExcludes } from "../src/syncscope";

function vault(files: string[]) {
  const root = mkdtempSync(join(tmpdir(), "ab-sync-"));
  for (const f of files) {
    mkdirSync(dirname(join(root, f)), { recursive: true });
    if (!f.endsWith("/")) writeFileSync(join(root, f), "x");
  }
  return root;
}

const FILES = [
  ".obsidian/app.json",
  "README.md",
  "08_tax/steuer.md",
  "00_strategy/Bewertung.md",
  "00_strategy/10_Research/r.md",
  "00_strategy/21_Projekt/Notiz.md",
  "00_strategy/21_Projekt/Assets/logo.svg",
  "00_strategy/21_Projekt/Brand/Guide.md",
  "00_strategy/21_Projekt/Brand/Brand-Inbox/Uploads/a.md",
];

describe("selektiver Sync", () => {
  it("plant ausgeschlossene Ordner und meldet Dateien, die trotzdem mitkämen", () => {
    const p = planExcludes(vault(FILES), "00_strategy/21_Projekt/Brand");
    expect(p.excluded).toEqual(["08_tax", "00_strategy/10_Research", "00_strategy/21_Projekt/Assets"]);
    expect(p.leaking).toEqual(["README.md", "00_strategy/Bewertung.md", "00_strategy/21_Projekt/Notiz.md"]);
  });
  it("findet auf dem Host alles außerhalb des erlaubten Ordners", () => {
    const root = vault(FILES);
    expect(outsideScope(root, "00_strategy/21_Projekt/Brand")).toEqual(
      expect.arrayContaining(["README.md", "08_tax/", "00_strategy/Bewertung.md", "00_strategy/10_Research/", "00_strategy/21_Projekt/Notiz.md", "00_strategy/21_Projekt/Assets/"]),
    );
    const clean = vault(["00_strategy/21_Projekt/Brand/Guide.md", ".obsidian/x.json"]);
    expect(outsideScope(clean, "00_strategy/21_Projekt/Brand")).toEqual([]);
  });
  it("akzeptiert ausdrücklich erlaubte Dateien, meldet alles andere weiter", () => {
    const root = vault(FILES);
    const p = planExcludes(root, "00_strategy/21_Projekt/Brand", ["README.md"]);
    expect(p.leaking).toEqual(["00_strategy/Bewertung.md", "00_strategy/21_Projekt/Notiz.md"]);
    const clean = vault(["README.md", "inbox.md", "00_strategy/21_Projekt/Brand/Guide.md"]);
    expect(outsideScope(clean, "00_strategy/21_Projekt/Brand", 1000, ["README.md", "inbox.md"])).toEqual([]);
    const neu = vault(["README.md", "neu.md", "00_strategy/21_Projekt/Brand/Guide.md"]);
    expect(outsideScope(neu, "00_strategy/21_Projekt/Brand", 1000, ["README.md", "inbox.md"])).toEqual(["neu.md"]);
  });

  it("baut einen shell-sicheren Befehl", () => {
    expect(excludeCommand("/Users/b/V ault", ["a b", "it's"])).toBe(
      "ob sync-config --path '/Users/b/V ault' --excluded-folders 'a b,it'\\''s' --configs '' --file-types image",
    );
  });
});
