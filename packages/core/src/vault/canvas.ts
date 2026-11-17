/**
 * Moodboard as an Obsidian canvas (JSON Canvas 1.0). One group per level,
 * one file node per image. Nodes people moved or added stay untouched;
 * the code only manages nodes with id "upl-<id>".
 */
import type { Vault } from "./vault";
import { LEVEL_LABEL, type LevelOrOpen } from "./uploads";

interface CanvasNode {
  id: string;
  type: "file" | "group" | "text" | "link";
  x: number;
  y: number;
  width: number;
  height: number;
  file?: string;
  label?: string;
  text?: string;
  color?: string;
  [k: string]: unknown;
}
interface CanvasDoc {
  nodes: CanvasNode[];
  edges: unknown[];
  [k: string]: unknown;
}

const COLS = 4;
const CELL = 280;
const IMG = 250;
const PAD = 40;
const GROUP_GAP = 120;
const ORDER: LevelOrOpen[] = ["brand", "campaign", "keep", "open"];

function groupX(i: number) {
  return i * (COLS * CELL + PAD * 2 + GROUP_GAP);
}

export function emptyCanvas(): CanvasDoc {
  return {
    nodes: ORDER.map((e, i) => ({
      id: `grp-${e}`,
      type: "group" as const,
      label: LEVEL_LABEL[e],
      x: groupX(i),
      y: 0,
      width: COLS * CELL + PAD * 2,
      height: CELL + PAD * 2,
    })),
    edges: [],
  };
}

function readCanvas(v: Vault): CanvasDoc {
  const p = v.dirs.moodboard;
  if (!v.exists(p)) return emptyCanvas();
  try {
    const doc = JSON.parse(v.readText(p)) as CanvasDoc;
    doc.nodes ??= [];
    doc.edges ??= [];
    return doc;
  } catch {
    // never overwrite a broken canvas: keep a copy
    const backup = `${p}.broken-${Date.now()}.json`;
    v.writeText(backup, v.readText(p));
    return emptyCanvas();
  }
}

function ensureGroup(doc: CanvasDoc, level: LevelOrOpen): CanvasNode {
  let g = doc.nodes.find((n) => n.id === `grp-${level}`);
  if (!g) {
    const i = ORDER.indexOf(level);
    g = { id: `grp-${level}`, type: "group", label: LEVEL_LABEL[level], x: groupX(i), y: 0, width: COLS * CELL + PAD * 2, height: CELL + PAD * 2 };
    doc.nodes.unshift(g);
  }
  return g;
}

function inside(n: CanvasNode, g: CanvasNode) {
  return n.x >= g.x && n.y >= g.y && n.x < g.x + g.width && n.y < g.y + g.height;
}

function placeInGroup(doc: CanvasDoc, g: CanvasNode, node: CanvasNode) {
  const taken = doc.nodes.filter((n) => n.type === "file" && n.id !== node.id && inside(n, g));
  for (let slot = 0; ; slot++) {
    const x = g.x + PAD + (slot % COLS) * CELL;
    const y = g.y + PAD + Math.floor(slot / COLS) * CELL;
    const busy = taken.some((n) => Math.abs(n.x - x) < CELL / 2 && Math.abs(n.y - y) < CELL / 2);
    if (!busy) {
      node.x = x;
      node.y = y;
      const needed = y + CELL + PAD - g.y;
      if (g.height < needed) g.height = needed;
      return;
    }
  }
}

/** Adds the image or moves it into the group of its (new) level. */
export function upsertCanvasImage(v: Vault, id: string, image: string, level: LevelOrOpen): void {
  const doc = readCanvas(v);
  const g = ensureGroup(doc, level);
  let node = doc.nodes.find((n) => n.id === `upl-${id}`);
  if (node && inside(node, g)) {
    node.file = image;
  } else {
    if (!node) {
      node = { id: `upl-${id}`, type: "file", file: image, x: 0, y: 0, width: IMG, height: IMG };
      doc.nodes.push(node);
    }
    placeInGroup(doc, g, node);
  }
  v.writeText(v.dirs.moodboard, JSON.stringify(doc, null, "\t") + "\n");
}

export function removeCanvasImage(v: Vault, id: string): void {
  if (!v.exists(v.dirs.moodboard)) return;
  const doc = readCanvas(v);
  const before = doc.nodes.length;
  doc.nodes = doc.nodes.filter((n) => n.id !== `upl-${id}`);
  doc.edges = (doc.edges as { fromNode?: string; toNode?: string }[]).filter(
    (e) => e.fromNode !== `upl-${id}` && e.toNode !== `upl-${id}`,
  );
  if (doc.nodes.length !== before) v.writeText(v.dirs.moodboard, JSON.stringify(doc, null, "\t") + "\n");
}
