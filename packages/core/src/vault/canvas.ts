/**
 * Moodboard als Obsidian-Canvas (JSON Canvas 1.0). Pro Ebene eine Gruppe,
 * jedes Bild ein Datei-Knoten. Vom Menschen verschobene oder ergänzte Knoten
 * bleiben unangetastet; der Code verwaltet nur Knoten mit id "upl-<id>".
 */
import type { Vault } from "./vault";
import { EBENEN_LABEL, type EbeneOderOffen } from "./uploads";

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
const ORDER: EbeneOderOffen[] = ["brand", "kampagne", "merken", "offen"];

function groupX(i: number) {
  return i * (COLS * CELL + PAD * 2 + GROUP_GAP);
}

export function emptyCanvas(): CanvasDoc {
  return {
    nodes: ORDER.map((e, i) => ({
      id: `grp-${e}`,
      type: "group" as const,
      label: EBENEN_LABEL[e],
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
    // kaputtes Canvas nicht überschreiben, sondern sichern
    const backup = `${p}.defekt-${Date.now()}.json`;
    v.writeText(backup, v.readText(p));
    return emptyCanvas();
  }
}

function ensureGroup(doc: CanvasDoc, ebene: EbeneOderOffen): CanvasNode {
  let g = doc.nodes.find((n) => n.id === `grp-${ebene}`);
  if (!g) {
    const i = ORDER.indexOf(ebene);
    g = { id: `grp-${ebene}`, type: "group", label: EBENEN_LABEL[ebene], x: groupX(i), y: 0, width: COLS * CELL + PAD * 2, height: CELL + PAD * 2 };
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

/** Fügt das Bild hinzu oder verschiebt es in die Gruppe seiner (neuen) Ebene. */
export function upsertCanvasImage(v: Vault, id: string, bild: string, ebene: EbeneOderOffen): void {
  const doc = readCanvas(v);
  const g = ensureGroup(doc, ebene);
  let node = doc.nodes.find((n) => n.id === `upl-${id}`);
  if (node && inside(node, g)) {
    node.file = bild;
  } else {
    if (!node) {
      node = { id: `upl-${id}`, type: "file", file: bild, x: 0, y: 0, width: IMG, height: IMG };
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
