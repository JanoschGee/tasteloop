/**
 * Erzeugt die Wortmarke als SVG-Datei (apps/web/public/logo.svg) und das Favicon (apps/web/app/icon.svg).
 * Der Kreis ist ein echter Stiftzug aus apps/web/lib/pencil.ts (fester Seed, damit das Logo stabil bleibt).
 * Aufruf: npx tsx scripts/build-logo.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pencilCircle } from "../apps/web/lib/pencil";

const INK = "#111111";
const PENCIL = "#E2231A";
const PAPER = "#FAF8F3";
const root = join(import.meta.dirname, "..");

function stroke(seed: number, x: number, y: number, w: number, h: number, sw: number): string {
  const main = pencilCircle(seed, { width: w, height: h, inset: 2 });
  const second = pencilCircle(seed + 7, { width: w, height: h, inset: 4, overshoot: 0.06 });
  return `<g transform="translate(${x} ${y})" fill="none" stroke="${PENCIL}" stroke-linecap="round" stroke-linejoin="round">
    <path d="${main.d}" stroke-width="${sw}"/>
    <path d="${second.d}" stroke-width="${(sw * 0.6).toFixed(1)}" stroke-opacity="0.35"/>
  </g>`;
}

// Maße für eine fette Helvetica-artige Grotesk bei 100 px, Laufweite -0.045em
const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 452 170" role="img" aria-label="tasteloop">
  <title>tasteloop</title>
  <text x="8" y="112" font-family="'Helvetica Neue', Helvetica, Inter, Arial, sans-serif" font-weight="700" font-size="100" letter-spacing="-4.5" fill="${INK}">taste<tspan>loop</tspan></text>
  ${stroke(20261117, 212, 14, 228, 136, 3)}
</svg>
`;

const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${PAPER}"/>
  <text x="32" y="45" text-anchor="middle" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-weight="700" font-size="38" letter-spacing="-2" fill="${INK}">tl</text>
  ${stroke(1117, 5, 8, 54, 48, 3)}
</svg>
`;

writeFileSync(join(root, "apps/web/public/logo.svg"), logo);
writeFileSync(join(root, "apps/web/app/icon.svg"), icon);
console.log("logo.svg und icon.svg geschrieben");
