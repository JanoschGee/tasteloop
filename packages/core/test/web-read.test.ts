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
    r.vault.writeBytes(r.vault.rel("Uploads/Images/a.jpg"), TINY_JPEG);
    expect(readImage(r, "Brand/Tasteloop/Uploads/Images/a.jpg")?.type).toBe("image/jpeg");
  });
  it("verweigert alles außerhalb, versteckte Dateien und Nicht-Bilder", () => {
    const r = reader();
    writeFileSync(join(r.root, "geheim.jpg"), TINY_JPEG);
    r.vault.writeText(r.vault.rel("notiz.md"), "x");
    expect(readImage(r, "geheim.jpg")).toBeUndefined();
    expect(readImage(r, "Brand/Tasteloop/../../geheim.jpg")).toBeUndefined();
    expect(readImage(r, "Brand/Tasteloop/notiz.md")).toBeUndefined();
    expect(readImage(r, "Brand/Tasteloop/.obsidian/x.png")).toBeUndefined();
    expect(readImage(r, "/etc/passwd.jpg")).toBeUndefined();
  });
});

describe("Lesen für die Galerie", () => {
  it("markiert Kern-Abschnitte im Guide", () => {
    const g = guideBlocks(reader())!;
    expect(g.title).toBe("Brand Guide Testbrand");
    expect(g.blocks.find((b) => b.ref === "Purpose")!.locked).toBe(true);
    expect(g.blocks.find((b) => b.ref === "1. Brand > Character")!.locked).toBe(true);
    expect(g.blocks.find((b) => b.ref === "3. Look and Feel > Colour")!.locked).toBe(false);
  });
  it("lehnt ungültige Upload-IDs ab", () => {
    const r = reader();
    expect(upload(r, "../Private")).toBeUndefined();
    expect(uploads(r)).toEqual([]);
  });
});

describe("Obsidian-Markdown", () => {
  const t = { uploadsDir: "B/Uploads", proposalsDir: "B/Proposals", briefsDir: "B/Briefs" };
  it("wandelt Einbettungen, Wikilinks, Callouts und Kommentare um", () => {
    const md = obsidianToMarkdown(
      "![[B/Uploads/Images/x 1.jpg|240]]\n[[B/Uploads/20261112-1530-abcd|abcd]] und [[Ordner/Brand Guide]]\n> [!question] Freigabe\n<!-- neuer-text:start -->",
      t,
    );
    expect(md).toContain("![](/api/image/B/Uploads/Images/x%201.jpg)");
    expect(md).toContain("[abcd](/upload/20261112-1530-abcd)");
    expect(md).toContain("und Brand Guide");
    expect(md).toContain("> **Freigabe**");
    expect(md).not.toContain("<!--");
  });
});
