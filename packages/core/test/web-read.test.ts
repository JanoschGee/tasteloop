/** Lese-API der Web-Galerie: nur Brand-Ordner, nur Bilder, Kern-Markierung, Obsidian-Markdown. */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { guideBlocks, readImage, upload, uploads, type Reader } from "../src/read";
import { obsidianToMarkdown } from "../../../apps/web/lib/markdown";
import { makeVault, TINY_JPEG } from "./helpers";

function reader(): Reader & { root: string } {
  const { cfg, vault, root } = makeVault();
  return { cfg, vault, root };
}

describe("readImage", () => {
  it("liefert Bilder aus dem Brand-Ordner", () => {
    const r = reader();
    r.vault.writeBytes(r.vault.rel("Uploads/Bilder/a.jpg"), TINY_JPEG);
    expect(readImage(r, "Marke/Brand-System/Uploads/Bilder/a.jpg")?.type).toBe("image/jpeg");
  });
  it("verweigert alles außerhalb, versteckte Dateien und Nicht-Bilder", () => {
    const r = reader();
    writeFileSync(join(r.root, "geheim.jpg"), TINY_JPEG);
    r.vault.writeText(r.vault.rel("notiz.md"), "x");
    expect(readImage(r, "geheim.jpg")).toBeUndefined();
    expect(readImage(r, "Marke/Brand-System/../../geheim.jpg")).toBeUndefined();
    expect(readImage(r, "Marke/Brand-System/notiz.md")).toBeUndefined();
    expect(readImage(r, "Marke/Brand-System/.obsidian/x.png")).toBeUndefined();
    expect(readImage(r, "/etc/passwd.jpg")).toBeUndefined();
  });
});

describe("Lesen für die Galerie", () => {
  it("markiert Kern-Abschnitte im Guide", () => {
    const g = guideBlocks(reader())!;
    expect(g.title).toBe("Brand Guide Testmarke");
    expect(g.blocks.find((b) => b.ref === "Leitgedanke")!.locked).toBe(true);
    expect(g.blocks.find((b) => b.ref === "1. Marke > Charakter")!.locked).toBe(true);
    expect(g.blocks.find((b) => b.ref === "3. Look and Feel > Farbe")!.locked).toBe(false);
  });
  it("lehnt ungültige Upload-IDs ab", () => {
    const r = reader();
    expect(upload(r, "../Fremd")).toBeUndefined();
    expect(uploads(r)).toEqual([]);
  });
});

describe("Obsidian-Markdown", () => {
  const t = { uploadsDir: "B/Uploads", vorschlaegeDir: "B/Vorschläge", briefingsDir: "B/Briefings" };
  it("wandelt Einbettungen, Wikilinks, Callouts und Kommentare um", () => {
    const md = obsidianToMarkdown(
      "![[B/Uploads/Bilder/x 1.jpg|240]]\n[[B/Uploads/20261112-1530-abcd|abcd]] und [[Ordner/Brand Guide]]\n> [!question] Freigabe\n<!-- neuer-text:start -->",
      t,
    );
    expect(md).toContain("![](/api/bild/B/Uploads/Bilder/x%201.jpg)");
    expect(md).toContain("[abcd](/upload/20261112-1530-abcd)");
    expect(md).toContain("und Brand Guide");
    expect(md).toContain("> **Freigabe**");
    expect(md).not.toContain("<!--");
  });
});
