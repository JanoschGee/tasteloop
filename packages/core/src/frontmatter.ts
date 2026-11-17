/** Markdown mit YAML-Frontmatter (Obsidian-Properties) lesen und schreiben. */
import { parse, stringify } from "yaml";

export interface MdDoc {
  props: Record<string, unknown>;
  body: string;
}

const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseMd(text: string): MdDoc {
  const m = FM.exec(text);
  if (!m) return { props: {}, body: text };
  const props = (parse(m[1]) ?? {}) as Record<string, unknown>;
  return { props, body: text.slice(m[0].length) };
}

export function stringifyMd(doc: MdDoc): string {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc.props)) if (v !== undefined) clean[k] = v;
  const yaml = stringify(clean, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n${doc.body.startsWith("\n") ? "" : "\n"}${doc.body}`;
}

/** Zerlegt einen Body in "## "-Abschnitte. Vorspann steht unter dem Schlüssel "". */
export function splitH2(body: string): { key: string; text: string }[] {
  const out: { key: string; text: string }[] = [];
  let cur = { key: "", lines: [] as string[] };
  let fence = false;
  for (const line of body.split("\n")) {
    if (/^(```|~~~)/.test(line)) fence = !fence;
    const m = !fence && /^## (.+?)\s*$/.exec(line);
    if (m) {
      out.push({ key: cur.key, text: cur.lines.join("\n").trim() });
      cur = { key: m[1], lines: [] };
    } else cur.lines.push(line);
  }
  out.push({ key: cur.key, text: cur.lines.join("\n").trim() });
  return out;
}

export function joinH2(parts: { key: string; text: string }[]): string {
  return (
    parts
      .filter((p) => p.key !== "" || p.text !== "")
      .map((p) => (p.key === "" ? p.text : `## ${p.key}\n\n${p.text}`.trimEnd()))
      .join("\n\n") + "\n"
  );
}
