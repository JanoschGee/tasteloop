/** Gebaute Seite: Inhalt, Barrierearmut, keine Formulare, keine fremden Ressourcen, Vercel-Header, Analytics nur auf Wunsch, Entwurfsschutz. */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyticsTag, build, liveRequested, REPO_URL } from "../build";

const here = join(import.meta.dirname, "..");
const dist = join(here, "dist");
const read = (f: string) => readFileSync(join(dist, f), "utf8");
let html = "";

beforeAll(() => {
  build();
  html = read("index.html");
});
afterAll(() => build());

describe("Inhalt", () => {
  it("enthält die vereinbarten Aussagen", () => {
    for (const s of [
      "Taste can't be",
      "AI gets you 80% there. Your team knows the rest.",
      "Tasteloop collects your team's taste (every reference, every “why”) and makes it readable for Claude and your agents.",
      "An AI made this ad in seconds.",
      "Drop a photo into the team chat.",
      "Say why it matters.",
      "Anyone on the team can add to it.",
      "Your agents get it.",
      "3 people agree",
      "3 people, 5 references",
      "Stop the",
      "Everyone adds.",
      "Disagreements surface.",
      "Humans approve.",
      "Your taste stays yours.",
      "Get it free",
      "Set it up with Claude Code in one prompt",
      "Hosted version for teams: later.",
      "MIT",
    ]) expect(html, s).toContain(s);
  });
  it("Haupt-CTA führt zum echten Repo, der Setup-Prompt ist kopierbar", () => {
    expect(REPO_URL).toBe("https://github.com/JanoschGee/tasteloop");
    expect(html).toContain(`href="${REPO_URL}"`);
    expect(html).toContain(`<code id="setup-prompt">Clone ${REPO_URL} and set up tasteloop</code>`);
    expect(html).toMatch(/<button type="button" class="copy" data-copy="setup-prompt"[^>]*hidden>Copy<\/button>/);
    expect(html).not.toContain("&lt;org&gt;");
  });
  it("Wortmarke mit Stiftkreis inline, Kreise als echte Stiftzüge", () => {
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"[^>]*>[\s\S]*?taste<tspan>loop<\/tspan>/);
    expect((html.match(/class="circle"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(html).not.toMatch(/<ellipse|<circle |Gradient/);
    expect(read("styles.css")).not.toMatch(/gradient\(/i);
  });
  it("erklärt den Ablauf in vier Schritten: Messenger, Classification, Brand memory, Agents", () => {
    const rail = /<nav class="rail"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? "";
    expect(rail.replace(/<svg[\s\S]*?<\/svg>|<[^>]+>/g, " ").replace(/\s+/g, " ")).toContain("01 Messenger 02 Classification 03 Brand memory 04 Agents");
    for (const id of ["step-messenger", "step-classification", "step-memory", "step-agents"]) {
      expect(html, id).toContain(`id="${id}"`);
      expect(html, id).toContain(`href="#${id}"`);
    }
    for (const s of [">Brand<", ">Campaign<", ">Just keep<", "locked", "learns", "Approved", "Brand/Brand Guide.md"]) expect(html, s).toContain(s);
  });
  it("mehrere Beitragende sind mit Namen sichtbar, nicht nur über Stiftfarben", () => {
    for (const n of ["Alex", "Kim", "Sam"]) expect(html).toMatch(new RegExp(`class="by">${n}`));
    expect(html).toContain("disagrees");
  });
  it("behauptet keine Kunden, Zahlen oder eine gehostete Version", () => {
    expect(html).not.toMatch(/trusted by|customers|testimonial|\d+\s?(x|%) (faster|better|more)|sign up|pricing/i);
  });
  it("Gelb gibt es nur in der einen lauten Sektion", () => {
    expect((html.match(/class="loud"/g) ?? []).length).toBe(1);
    const css = read("styles.css");
    const uses = css.split("\n").filter((l) => /var\(--marker\)|#ffe500/i.test(l) && !/^\s*--marker:/.test(l));
    expect(uses.length).toBeGreaterThan(0);
    for (const l of uses) expect(l, l).toMatch(/\.loud/);
  });
});

describe("Keine personenbezogenen Daten, kein Cloudflare mehr", () => {
  it("kein Formular, keine Eingabefelder, keine Warteliste, keine Functions oder Wrangler-Reste", () => {
    const all = readdirSync(dist).filter((f) => f.endsWith(".html")).map(read).join("\n");
    expect(all).not.toMatch(/<form|<input|<select|<textarea|waitlist|\/api\//i);
    for (const f of ["functions", "wrangler.toml", "migrations"]) expect(existsSync(join(here, f)), f).toBe(false);
    expect(existsSync(join(dist, "_headers"))).toBe(false);
  });
});

describe("Bilder, Bewegung und CSP", () => {
  it("jedes Bild hat alt, Breite und Höhe, liegt lokal als WebP vor; unter dem Falz wird nachgeladen", () => {
    const imgs = html.match(/<img\b[^>]*>/g) ?? [];
    expect(imgs.length).toBeGreaterThanOrEqual(6);
    for (const tag of imgs) {
      expect(tag, tag).toMatch(/\salt="[^"]*"/);
      expect(tag, tag).toMatch(/\swidth="\d+"/);
      expect(tag, tag).toMatch(/\sheight="\d+"/);
      const src = /\ssrc="(\/img\/[\w-]+\.webp)"/.exec(tag)?.[1];
      expect(src, tag).toBeTruthy();
      expect(existsSync(join(dist, src!)), src).toBe(true);
      if (!tag.includes("hero-desk")) expect(tag, tag).toContain('loading="lazy"');
    }
    // inhaltliche Bilder (nicht in einer role="img"-Illustration) brauchen einen echten Alt-Text
    expect(imgs.filter((t) => /\salt="[^"]{20,}"/.test(t)).length).toBeGreaterThanOrEqual(6);
    expect(html).toMatch(/hero-desk\.webp"[^>]*fetchpriority="high"/);
  });
  it("Seitengewicht bleibt im Rahmen (Hero ≤ 200 kB, alles zusammen < 1,5 MB)", () => {
    const size = (dir: string): number =>
      readdirSync(dir).reduce((sum, f) => {
        const p = join(dir, f);
        return sum + (statSync(p).isDirectory() ? size(p) : statSync(p).size);
      }, 0);
    expect(statSync(join(dist, "img/hero-desk.webp")).size).toBeLessThanOrEqual(200_000);
    expect(size(dist)).toBeLessThan(1_500_000);
  });
  it("CSP-tauglich: kein Inline-Skript, kein Inline-Stil, keine Event-Attribute", () => {
    const all = readdirSync(dist).filter((f) => f.endsWith(".html")).map(read).join("\n");
    expect(all).not.toMatch(/<style[\s>]/i);
    expect(all).not.toMatch(/\sstyle\s*=/i);
    expect(all).not.toMatch(/\son[a-z]+\s*=\s*["']/i);
    for (const tag of all.match(/<script\b[^>]*>[\s\S]*?<\/script>/g) ?? []) expect(tag, tag).toMatch(/^<script (defer )?src="\/[^"]+"( defer)?><\/script>$/);
    const js = read("app.js");
    expect(js).not.toMatch(/\beval\(|new Function|innerHTML|\.style\.|setAttribute\("style"|fetch\(|XMLHttpRequest|import\(/);
  });
  it("Bewegung: Stiftzüge sind zeichenbar, ohne Bewegung und ohne JavaScript bleibt alles lesbar", () => {
    const css = read("styles.css");
    expect(html).toMatch(/<path pathLength="1" d="M/);
    expect(css).toContain("stroke-dashoffset");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*animation: none !important;[\s\S]*transition: none !important;/);
    // versteckte Startzustände nur unter .js und nur ohne reduzierte Bewegung
    const [base, motion] = css.split("@media (prefers-reduced-motion: no-preference)");
    expect(motion).toBeTruthy();
    expect(base).not.toMatch(/\.(pop|write|type|stamp-in)[^{]*\{[^}]*(opacity: 0|clip-path)/);
    expect(motion).toContain(".js .anim:not(.in) .pop");
    expect(css).toMatch(/@supports \(animation-timeline: view\(\)\)/);
    expect(read("app.js")).toContain("prefers-reduced-motion: reduce");
    expect(read("app.js")).toContain("IntersectionObserver");
  });
  it("Schriften kommen von der eigenen Seite", () => {
    for (const f of ["fonts/caveat-latin-400-normal.woff2", "fonts/inter-tight-latin-wght-normal.woff2", "fonts/inter-tight-LICENSE.txt"]) expect(existsSync(join(dist, f)), f).toBe(true);
    expect(read("styles.css")).toMatch(/url\("\/fonts\/inter-tight-latin-wght-normal\.woff2"\)/);
  });
});

describe("Barrierearm und schnell", () => {
  it("Grundgerüst", () => {
    expect(html).toMatch(/^<!doctype html>\n<html lang="en">/);
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(html).toMatch(/<meta name="description" content="[^"]{50,160}">/);
    expect((html.match(/<h1[ >]/g) ?? []).length).toBe(1);
    expect(html).toContain('<main id="main">');
    expect(html).toContain('href="#main"');
    expect(html).toMatch(/role="status" aria-live="polite"/);
  });
  it("lädt nichts von fremden Hosts und setzt keine Tracker (Standard)", () => {
    const all = ["index.html", "imprint.html", "privacy.html", "styles.css", "app.js"].map(read).join("\n");
    expect(all).not.toMatch(/(src|srcset)="https?:\/\//);
    expect(all).not.toMatch(/@import|\/\/[\w.-]+\.(com|net|org|io)\/[^"\s]*\.(js|css|woff2?)/);
    expect(all).not.toMatch(/url\(["']?https?:/);
    expect(all).not.toMatch(/_vercel\/insights|cloudflareinsights|googleapis|gstatic|google-analytics|gtag|googletagmanager|plausible|hotjar|segment|facebook|document\.cookie|localStorage/i);
    expect(existsSync(join(dist, "fonts/caveat-latin-400-normal.woff2"))).toBe(true);
  });
});

describe("Vercel", () => {
  const cfg = JSON.parse(readFileSync(join(here, "vercel.json"), "utf8"));
  const headers = Object.fromEntries(cfg.headers[0].headers.map((h: { key: string; value: string }) => [h.key, h.value]));

  it("statische Seite mit Output-Verzeichnis, Clean URLs und Live-Build", () => {
    expect(cfg.outputDirectory).toBe("dist");
    expect(cfg.cleanUrls).toBe(true);
    expect(cfg.framework).toBeNull();
    expect(cfg.buildCommand).toContain("apps/landing/build.ts --live");
    expect(cfg.headers[0].source).toBe("/(.*)");
  });
  it("dieselben Sicherheitsheader wie bisher", () => {
    expect(headers["Content-Security-Policy"]).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'",
    );
    expect(headers["Strict-Transport-Security"]).toBe("max-age=31536000; includeSubDomains");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
  });
  it("interne Links passen zu Clean URLs", () => {
    expect(html).toContain('href="/imprint">Imprint<');
    expect(html).toContain('href="/privacy">Privacy<');
    expect(html).not.toMatch(/href="\/[\w-]+\.html"/);
  });
});

describe("Vercel Web Analytics (optional)", () => {
  it("ist nur auf Wunsch an und kommt von derselben Domain (CSP 'self' reicht)", () => {
    build({ analytics: true });
    expect(read("index.html")).toContain('<script defer src="/_vercel/insights/script.js"></script>');
    build();
    expect(read("index.html")).not.toContain("_vercel/insights");
    expect(analyticsTag(false)).toBe("");
  });
});

describe("Impressum, Datenschutz und Livegang", () => {
  it("Impressum: englisch, mit Pflichtangaben und Kontakt-E-Mail", () => {
    const p = read("imprint.html");
    expect(p).toContain('<html lang="en">');
    for (const s of ["Information pursuant to § 5 DDG", " GmbH", "Goldenfelsstr. 9", "50935 Köln", "Managing Director", "HRB 105791", "DE343108788", "Responsible for content"]) expect(p, s).toContain(s);
    expect(p).toContain("Register court: Amtsgericht Köln");
    expect(p).toMatch(/href="mailto:[^"]+@[^"]+"/);
    expect(p).not.toMatch(/disclaimer|haftung/i);
  });
  it("Impressum und Datenschutz sind final: kein Entwurf, kein TODO", () => {
    for (const f of ["imprint.html", "privacy.html"]) {
      const p = read(f);
      expect(p).not.toContain('data-draft="true"');
      expect(p).not.toContain("[TODO");
    }
  });
  it("der Live-Build läuft mit den finalen Rechtstexten", () => {
    expect(() => build({ live: true })).not.toThrow();
    expect(() => build({ repoUrl: "javascript:alert(1)" })).toThrow(/repo URL/);
  });
  it("auf Vercel gilt der Entwurfsschutz nur für die Produktion", () => {
    expect(liveRequested(["--live"], { VERCEL_ENV: "production" })).toBe(true);
    expect(liveRequested(["--live"], {})).toBe(true);
    expect(liveRequested(["--live"], { VERCEL_ENV: "preview" })).toBe(false);
    expect(liveRequested([], { VERCEL_ENV: "production" })).toBe(false);
  });
});
