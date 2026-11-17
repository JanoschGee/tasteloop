/**
 * Der von Hand gezogene Kreis (Markenzeichen): ein Stiftzug, der etwas mehr als eine
 * Umdrehung läuft, leicht eiert, sich am Ende überlappt und nicht ganz schließt.
 * Deterministisch pro Seed (gleich auf Server und Client), aber nie zweimal gleich.
 */

/** kleiner deterministischer Zufallsgenerator (mulberry32) */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export interface PencilOptions {
  /** Breite und Höhe der Zeichenfläche (viewBox) */
  width: number;
  height: number;
  /** Abstand zum Rand der Zeichenfläche */
  inset?: number;
  /** wie weit der Strich über die volle Umdrehung hinausläuft (0.06–0.25) */
  overshoot?: number;
  /** wie stark er eiert (0–0.08 vom Radius) */
  wobble?: number;
}

export interface PencilStroke {
  d: string;
  /** Punkte zum Prüfen (Tests) */
  points: [number, number][];
}

/** Catmull-Rom -> kubische Bezier, ergibt einen weichen, handschriftlichen Zug */
function smoothPath(pts: [number, number][]): string {
  const f = (n: number) => n.toFixed(1);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}

export function pencilCircle(seed: number, o: PencilOptions): PencilStroke {
  const r = rng(seed);
  const inset = o.inset ?? 4;
  const cx = o.width / 2 + (r() - 0.5) * o.width * 0.03;
  const cy = o.height / 2 + (r() - 0.5) * o.height * 0.05;
  const rx = o.width / 2 - inset;
  const ry = o.height / 2 - inset;
  const overshoot = o.overshoot ?? 0.1 + r() * 0.12;
  const wobble = o.wobble ?? 0.05;
  // Start oben rechts wie bei einer Rechtshänderin, gegen den Uhrzeigersinn
  const start = -Math.PI * (0.18 + r() * 0.2);
  const sweep = -Math.PI * 2 * (1 + overshoot);
  // leichte Neigung des ganzen Kreises
  const tilt = (r() - 0.5) * 0.12;
  const ph1 = r() * Math.PI * 2;
  const ph2 = r() * Math.PI * 2;
  const a2 = wobble * (0.4 + r() * 0.6);
  const a3 = wobble * (0.2 + r() * 0.5);
  const steps = 28;
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ang = start + sweep * t;
    // Radius-Schwankung: niedrige Frequenzen eiern, die Spirale öffnet sich zum Ende leicht
    const k = 1 + a2 * Math.sin(2 * ang + ph1) + a3 * Math.sin(3 * ang + ph2) + 0.045 * t - 0.02;
    const x0 = Math.cos(ang) * rx * k;
    const y0 = Math.sin(ang) * ry * k;
    pts.push([cx + x0 * Math.cos(tilt) - y0 * Math.sin(tilt), cy + x0 * Math.sin(tilt) + y0 * Math.cos(tilt)]);
  }
  return { d: smoothPath(pts), points: pts };
}
