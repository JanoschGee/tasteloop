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
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pencilCircle, seedOf } from "../web/lib/pencil";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const src = join(here, "src");
const dist = join(here, "dist");

export const REPO_URL = "https://github.com/JanoschGee/tasteloop";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function circleSvg(seed: string, w: number, h: number): string {
  const s = seedOf(seed);
  const a = pencilCircle(s, { width: w, height: h });
  const b = pencilCircle(s + 7, { width: w, height: h, inset: 6, overshoot: 0.06 });
  return `<svg class="circle" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="${a.d}" stroke-width="2.4"/><path d="${b.d}" stroke-width="1.4"/></svg>`;
}

function inlineLogo(): string {
  const svg = readFileSync(join(repo, "apps/web/public/logo.svg"), "utf8");
  return svg
    .replace(/<title>[^<]*<\/title>\s*/, "")
    .replace('role="img" aria-label="tasteloop"', 'aria-hidden="true" focusable="false"')
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
    .replace(/\{\{CIRCLE:([\w-]+):(\d+):(\d+)\}\}/g, (_m, seed: string, w: string, h: string) => circleSvg(seed, Number(w), Number(h)));
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
    else copyFileSync(from, to);
    written.push(f);
  }
  copyFileSync(join(repo, "apps/web/app/icon.svg"), join(dist, "icon.svg"));
  const font = join(repo, "node_modules/@fontsource/caveat/files/caveat-latin-400-normal.woff2");
  if (!existsSync(font)) throw new Error("Caveat missing: run npm install in the repo");
  copyFileSync(font, join(dist, "fonts/caveat-latin-400-normal.woff2"));
  copyFileSync(join(repo, "node_modules/@fontsource/caveat/LICENSE"), join(dist, "fonts/caveat-LICENSE.txt"));
  written.push("icon.svg", "fonts/caveat-latin-400-normal.woff2");
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
