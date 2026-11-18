/**
 * Baut die statische Landing-Page nach dist/ (Vercel, siehe vercel.json für Header und Clean URLs).
 *   npx tsx apps/landing/build.ts          Entwurf (Impressum/Datenschutz als Platzhalter erlaubt)
 *   npx tsx apps/landing/build.ts --live   bricht ab, solange eine Seite als Entwurf markiert ist oder noch ein [TODO] enthält
 * Optionen:
 *   --repo-url=https://github.com/…   anderer Link für „Get it free“ (Standard: REPO_URL)
 *   --analytics                       Vercel Web Analytics einschalten (cookielos, standardmäßig aus;
 *                                     zusätzlich im Vercel-Projekt aktivieren)
 * Kein Framework, keine externen Ressourcen: Logo, Kreise und Schrift kommen aus dem Repo.
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pencilCircle, rng, seedOf } from "../web/lib/pencil";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const src = join(here, "src");
const dist = join(here, "dist");

export const REPO_URL = "https://github.com/JanoschGee/tasteloop";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Stiftkreis als Inline-SVG. pathLength="1" macht den Zug per stroke-dashoffset zeichenbar,
 * der Filter #rough (einmal in der Seite definiert) gibt die raue Stiftkante.
 * mod: optionale Zusatzklasse, z. B. "blue" -> circle--blue (Stiftfarbe einer Person), "marker" (dicker Marker).
 */
export function circleSvg(seed: string, w: number, h: number, mod?: string): string {
  const s = seedOf(seed);
  const a = pencilCircle(s, { width: w, height: h });
  const b = pencilCircle(s + 7, { width: w, height: h, inset: 6, overshoot: 0.06 });
  const cls = mod ? `circle circle--${mod}` : "circle";
  const frame = `<path class="bb" d="M-10 -10H${w + 10}V${h + 10}H-10Z"/>`;
  return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><g filter="url(#${mod === "marker" ? "marker" : "rough"})">${frame}<path pathLength="1" d="${a.d}"/><path pathLength="1" d="${b.d}"/></g></svg>`;
}

/** Handgezogene Unterstreichung: ein leicht welliger Strich, optional mit Rückstrich. */
export function underlineSvg(seed: string, w: number): string {
  const r = rng(seedOf(seed));
  const f = (n: number) => n.toFixed(1);
  const y0 = 5 + r() * 2;
  const y1 = 4 + r() * 3;
  const c = (a: number, b: number) => `C${f(w * 0.3)} ${f(a - 2 - r() * 2)} ${f(w * 0.65)} ${f(b + 2 + r() * 2)}`;
  const d1 = `M3 ${f(y0)} ${c(y0, y1)} ${f(w - 3)} ${f(y1)}`;
  const d2 = `M${f(w - 8)} ${f(y1 + 3.5)} C${f(w * 0.7)} ${f(y1 + 6)} ${f(w * 0.4)} ${f(y0 + 3)} ${f(w * 0.12)} ${f(y0 + 5)}`;
  return `<svg class="uline" viewBox="0 0 ${w} 14" preserveAspectRatio="none" aria-hidden="true" focusable="false"><g filter="url(#rough)"><path class="bb" d="M-6 -6H${w + 6}V20H-6Z"/><path pathLength="1" d="${d1}"/><path pathLength="1" d="${d2}"/></g></svg>`;
}

/**
 * Die Schleife des Systembilds: ein großer, von Hand gezogener Kreis (im Uhrzeigersinn gespiegelt),
 * dessen Ende mit einer Pfeilspitze wieder auf die erste Station zeigt. Drei Punkte laufen per SMIL
 * (kein Skript, CSP-tauglich) genau eine Runde auf dem Strich; ohne Bewegung sind sie ausgeblendet.
 */
export const LOOP_OVERSHOOT = 0.03;
export function loopSvg(seed: string, w: number, h: number, inset: number): string {
  const s = seedOf(seed);
  const main = pencilCircle(s, { width: w, height: h, inset, overshoot: LOOP_OVERSHOOT, wobble: 0.025 });
  const second = pencilCircle(s + 7, { width: w, height: h, inset: inset + 7, overshoot: 0.05, wobble: 0.03 });
  const f = (n: number) => n.toFixed(1);
  const pts = main.points;
  const [ex, ey] = pts[pts.length - 1];
  const [px, py] = pts[pts.length - 2];
  const dir = Math.atan2(ey - py, ex - px);
  const len = Math.max(16, Math.min(w, h) * 0.045);
  const wing = (a: number) => `${f(ex - Math.cos(dir + a) * len)} ${f(ey - Math.sin(dir + a) * len)}`;
  const head = `M${wing(0.5)} L${f(ex)} ${f(ey)} L${wing(-0.5)}`;
  const id = `loop-${w}x${h}`;
  const mirror = `translate(${w} 0) scale(-1 1)`;
  const end = (1 / (1 + LOOP_OVERSHOOT)).toFixed(3);
  const dot = (begin: string) =>
    `<path class="ldot" d="M-6 0a6 6 0 1 0 12 0a6 6 0 1 0 -12 0"><animateMotion dur="12s" begin="${begin}" repeatCount="indefinite" calcMode="linear" keyTimes="0;1" keyPoints="0;${end}"><mpath href="#${id}"/></animateMotion></path>`;
  return (
    `<svg class="arrow loop-ring loop-ring--${w > h ? "wide" : "tall"}" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false">` +
    `<g transform="${mirror}" filter="url(#rough)"><path class="bb" d="M-10 -10H${w + 10}V${h + 10}H-10Z"/><path class="r2" pathLength="1" d="${second.d}"/><path id="${id}" class="r1" pathLength="1" d="${main.d}"/><path class="rh" pathLength="1" d="${head}"/></g>` +
    `<g transform="${mirror}">${dot("0s")}${dot("-4s")}${dot("-8s")}</g></svg>`
  );
}

/** Wellenform einer Sprachnotiz als ein Pfad aus senkrechten Strichen. */
export function waveSvg(seed: string, bars: number): string {
  const r = rng(seedOf(seed));
  let d = "";
  for (let i = 0; i < bars; i++) {
    const env = 0.35 + 0.65 * Math.sin((Math.PI * (i + 0.5)) / bars);
    const h = Math.max(2, Math.round((3 + r() * 15) * env));
    d += `M${2 + i * 4} ${12 - h / 2}v${h}`;
  }
  return `<svg class="wave" viewBox="0 0 ${bars * 4} 24" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
}

function inlineLogo(): string {
  const svg = readFileSync(join(repo, "apps/web/public/logo.svg"), "utf8");
  return svg
    .replace(/<title>[^<]*<\/title>\s*/, "")
    .replace('role="img" aria-label="tasteloop"', 'aria-hidden="true" focusable="false"')
    .replace(/<path d=/g, '<path pathLength="1" d=')
    .trim();
}

export interface BuildOptions {
  live?: boolean;
  repoUrl?: string;
  /** Vercel Web Analytics (Skript von derselben Domain, cookielos) */
  analytics?: boolean;
}

export function analyticsTag(on: boolean | undefined): string {
  // Vercel liefert das Skript von der eigenen Domain aus: die CSP 'self' reicht, kein Drittanbieter
  return on ? '<script defer src="/_vercel/insights/script.js"></script>' : "";
}

export function render(html: string, opts: BuildOptions = {}): string {
  const logo = inlineLogo();
  const repo = opts.repoUrl ?? REPO_URL;
  if (!/^https:\/\/[^\s"']+$/.test(repo)) throw new Error(`Invalid repo URL: ${repo}`);
  const out = html
    .replace(/\{\{LOGO\}\}/g, logo)
    .replace(/\{\{LOGO_SMALL\}\}/g, logo)
    .replace(/\{\{REPO_URL\}\}/g, escapeHtml(repo))
    .replace(/\{\{ANALYTICS\}\}/g, analyticsTag(opts.analytics))
    .replace(/\{\{CIRCLE:([\w-]+):(\d+):(\d+)(?::([a-z]+))?\}\}/g, (_m, seed: string, w: string, h: string, mod?: string) => circleSvg(seed, Number(w), Number(h), mod))
    .replace(/\{\{UNDERLINE:([\w-]+):(\d+)\}\}/g, (_m, seed: string, w: string) => underlineSvg(seed, Number(w)))
    .replace(/\{\{LOOP:([\w-]+):(\d+):(\d+):(\d+)\}\}/g, (_m, seed: string, w: string, h: string, inset: string) => loopSvg(seed, Number(w), Number(h), Number(inset)))
    .replace(/\{\{WAVE:([\w-]+):(\d+)\}\}/g, (_m, seed: string, n: string) => waveSvg(seed, Number(n)));
  const left = /\{\{[A-Z_:\w-]+\}\}/.exec(out);
  if (left) throw new Error(`Placeholder not replaced: ${left[0]}`);
  return out;
}

export function build(opts: BuildOptions = {}): string[] {
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(join(dist, "fonts"), { recursive: true });
  const written: string[] = [];
  for (const f of readdirSync(src)) {
    const from = join(src, f);
    const to = join(dist, f);
    if (f.endsWith(".html")) writeFileSync(to, render(readFileSync(from, "utf8"), opts));
    else if (statSync(from).isDirectory()) cpSync(from, to, { recursive: true });
    else copyFileSync(from, to);
    written.push(f);
  }
  copyFileSync(join(repo, "apps/web/app/icon.svg"), join(dist, "icon.svg"));
  const font = join(repo, "node_modules/@fontsource/caveat/files/caveat-latin-400-normal.woff2");
  if (!existsSync(font)) throw new Error("Caveat missing: run npm install in the repo");
  copyFileSync(font, join(dist, "fonts/caveat-latin-400-normal.woff2"));
  copyFileSync(join(repo, "node_modules/@fontsource/caveat/LICENSE"), join(dist, "fonts/caveat-LICENSE.txt"));
  const grotesk = join(repo, "node_modules/@fontsource-variable/inter-tight/files/inter-tight-latin-wght-normal.woff2");
  if (!existsSync(grotesk)) throw new Error("Inter Tight missing: run npm install in the repo");
  copyFileSync(grotesk, join(dist, "fonts/inter-tight-latin-wght-normal.woff2"));
  copyFileSync(join(repo, "node_modules/@fontsource-variable/inter-tight/LICENSE"), join(dist, "fonts/inter-tight-LICENSE.txt"));
  written.push("icon.svg", "fonts/caveat-latin-400-normal.woff2", "fonts/inter-tight-latin-wght-normal.woff2");
  if (opts.live) {
    const drafts = readdirSync(dist).filter((f) => f.endsWith(".html") && readFileSync(join(dist, f), "utf8").includes('data-draft="true"'));
    if (drafts.length) throw new Error(`Not for production: draft pages ${drafts.join(", ")}. Put in the final texts first.`);
    const todos = readdirSync(dist).filter((f) => f.endsWith(".html") && readFileSync(join(dist, f), "utf8").includes("[TODO"));
    if (todos.length) throw new Error(`Not for production: open [TODO] in ${todos.join(", ")}.`);
  }
  return written;
}

/**
 * --live gilt für die Produktion. Vercel-Vorschauen (VERCEL_ENV=preview) bauen als Entwurf,
 * damit man Änderungen ansehen kann, bevor Impressum und Datenschutz fertig sind (Entwürfe tragen noindex).
 */
export function liveRequested(argv: string[], env: Record<string, string | undefined>): boolean {
  if (!argv.includes("--live")) return false;
  if (env.VERCEL_ENV && env.VERCEL_ENV !== "production") {
    console.warn(`Note: VERCEL_ENV=${env.VERCEL_ENV}, building as a draft (the draft guard only applies to production).`);
    return false;
  }
  return true;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  try {
    const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
    const files = build({ live: liveRequested(process.argv, process.env), repoUrl: arg("repo-url"), analytics: process.argv.includes("--analytics") });
    console.log(`Landing page built: ${files.length} files in ${dist}`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
