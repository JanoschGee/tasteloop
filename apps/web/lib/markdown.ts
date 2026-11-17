/**
 * Obsidian-Markdown -> normales Markdown für react-markdown:
 * Einbettungen ![[bild.jpg|240]] werden zu Bildern über /api/bild,
 * Wikilinks [[pfad|text]] zu Links auf bekannte Seiten oder zu Text.
 */
import { imageUrl } from "./vault";

export interface LinkTargets {
  uploadsDir: string;
  vorschlaegeDir: string;
  briefingsDir: string;
}

function linkFor(target: string, t: LinkTargets): string | undefined {
  const clean = target.replace(/\.md$/, "");
  const name = clean.split("/").pop()!;
  if (clean.startsWith(t.uploadsDir + "/")) return `/upload/${encodeURIComponent(name)}`;
  if (clean.startsWith(t.vorschlaegeDir + "/")) return `/vorschlaege/${encodeURIComponent(name)}`;
  if (clean.startsWith(t.briefingsDir + "/")) return `/briefings/${encodeURIComponent(name)}`;
  return undefined;
}

export function obsidianToMarkdown(text: string, t: LinkTargets): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/!\[\[([^\]|]+?\.(?:jpe?g|png|webp|gif))(?:\|[^\]]*)?\]\]/gi, (_m, p: string) => `![](${imageUrl(p)})`)
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_m, p: string, label?: string) => {
      const href = linkFor(p, t);
      const text = label ?? p.split("/").pop()!.replace(/\.md$/, "");
      return href ? `[${text}](${href})` : text;
    })
    .replace(/^> \[!(\w+)\][-+]? ?(.*)$/gm, (_m, kind: string, title: string) => `> **${title || kind}**`);
}
