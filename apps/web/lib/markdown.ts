/**
 * Obsidian Markdown -> plain Markdown for react-markdown:
 * embeds ![[image.jpg|240]] become images via /api/image,
 * wikilinks [[path|text]] become links to known pages or plain text.
 */
import { imageUrl } from "./vault";

export interface LinkTargets {
  uploadsDir: string;
  proposalsDir: string;
  briefsDir: string;
}

function linkFor(target: string, t: LinkTargets): string | undefined {
  const clean = target.replace(/\.md$/, "");
  const name = clean.split("/").pop()!;
  if (clean.startsWith(t.uploadsDir + "/")) return `/upload/${encodeURIComponent(name)}`;
  if (clean.startsWith(t.proposalsDir + "/")) return `/proposals/${encodeURIComponent(name)}`;
  if (clean.startsWith(t.briefsDir + "/")) return `/briefs/${encodeURIComponent(name)}`;
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
