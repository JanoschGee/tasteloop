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
      "Brand memory for",
      "AI makes everything look the same. Your team's taste is the difference.",
      "Drop references into your team chat and say why. Tasteloop turns them into rules your agents follow, and a person approves every change.",
      "the more your team adds, the more on-brand every output gets.",
      "Taste can't be prompted.",
      "AI gets you 80% there. Your team knows the rest.",
      "An AI made this image in seconds.",
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
      "How does your team keep AI output on-brand today?",
      "Send me occasional updates about Tasteloop.",
      "We'll email you the link. No spam.",
      "Hosted version for teams: later.",
    ]) expect(html, s).toContain(s);
    expect(html).toMatch(/<h1 id="hero-title">Brand memory for <span class="circled">AI-first<svg[\s\S]*?<\/svg><\/span> teams\.<\/h1>/);
  });
  it("nennt weder die Lizenz noch den Namen eines Wettbewerbers", () => {
    expect(html).not.toMatch(/\bMIT\b|open source|open-source/i);
    expect(html).not.toMatch(/brand\s?os\b/i);
  });
  it("Systembild: eine Schleife mit fünf Stationen und den Werkzeugen, keine Linie", () => {
    const sys = /<section id="stack"[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
    const order = ["Capture", "Understand", "Remember", "Decide", "Use"];
    const found = [...sys.matchAll(/<p class="node-k"><span class="st-n">(\d)<\/span> (\w+)<\/p>/g)].map((m) => `${m[1]} ${m[2]}`);
    expect(found).toEqual(order.map((k, i) => `${i + 1} ${k}`));
    for (const b of ["Telegram", "whisper.cpp", "Claude API", "Obsidian", "Markdown", "Weekly digest", "Claude Code", "Claude", "any agent"]) expect(sys, b).toContain(`<span class="badge">${b}</span>`);
    for (const t of ["your Mac or a small Linux server", "<code>set up tasteloop</code>", "The core stays locked.", "The more your team adds, the more on-brand every output gets."]) expect(sys, t).toContain(t);
    expect(sys).not.toMatch(/<img\b/);
    // zwei handgezogene Ringe (quer für Desktop, hoch für Mobil), je mit Pfeilspitze und drei laufenden Punkten
    const rings = sys.match(/<svg class="arrow loop-ring loop-ring--(wide|tall)"[\s\S]*?<\/svg>/g) ?? [];
    expect(rings.length).toBe(2);
    for (const ring of rings) {
      expect(ring).toMatch(/<path id="loop-\d+x\d+" class="r1" pathLength="1" d="M[\d. -]+ C/);
      expect(ring).toContain('class="rh"');
      expect((ring.match(/<animateMotion /g) ?? []).length).toBe(3);
      expect((ring.match(/ C/g) ?? []).length).toBeGreaterThan(40);
    }
    expect(sys).not.toMatch(/sys-rail|sys-nodes/);
    const css = read("styles.css");
    // ohne Bewegung: Punkte aus, Stationen sichtbar (Punkte erscheinen nur im no-preference-Block)
    const [base, motion] = css.split("@media (prefers-reduced-motion: no-preference)");
    expect(base).toMatch(/\.loop-ring path\.ldot \{[^}]*display: none;/);
    expect(motion).toMatch(/\.loop-ring path\.ldot \{ display: inline; \}/);
    for (const c of ["st-capture", "st-understand", "st-remember", "st-decide", "st-use"]) expect(css, c).toMatch(new RegExp(`\\.${c} \\{ left: [\\d.]+%; top: [\\d.]+%; \\}`));
  });
  it("die vier Schritte enden nicht in einer Sackgasse: sichtbarer Rücksprung von Agents zu Messenger", () => {
    const flow = /<section id="how"[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
    expect(flow).toMatch(/<p class="loop-back anim">\s*<a href="#step-messenger">/);
    expect(flow).toContain("next reference, next week.");
    expect(flow).toMatch(/<li class="rail-loop"><a href="#step-messenger" aria-label="and back to step 01, Messenger">/);
  });
  it("der Link zum Repo steht nur auf /welcome, nicht auf den öffentlichen Seiten", () => {
    expect(REPO_URL).toMatch(/^https:\/\/github\.com\/[\w-]+\/tasteloop$/);
    for (const f of ["index.html", "imprint.html", "privacy.html", "check-inbox.html", "try-again.html"]) expect(read(f), f).not.toMatch(/github\.com/i);
    expect(html).not.toMatch(/>GitHub</);
    const w = read("welcome.html");
    expect(w).toContain("You're in.");
    expect(w).toContain(`<a class="button" href="${REPO_URL}">Get it on GitHub</a>`);
    expect(w).toContain(`<code id="setup-prompt">Clone ${REPO_URL} and set up tasteloop</code>`);
    expect(w).toMatch(/<button type="button" class="copy" data-copy="setup-prompt"[^>]*hidden>Copy<\/button>/);
    expect(w).not.toContain("&lt;org&gt;");
    for (const f of ["welcome.html", "check-inbox.html", "try-again.html"]) expect(read(f), f).toContain('<meta name="robots" content="noindex">');
    expect(read("check-inbox.html")).toContain("Check your inbox to confirm. The link comes right after.");
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

describe("Anmeldeformular", () => {
  it("genau ein Formular, nur auf der Startseite, das ohne JavaScript an die eigene Funktion sendet", () => {
    const pages = readdirSync(dist).filter((f) => f.endsWith(".html"));
    for (const f of pages.filter((f) => f !== "index.html")) expect(read(f), f).not.toMatch(/<form|<input|<select|<textarea/i);
    expect((html.match(/<form\b/g) ?? []).length).toBe(1);
    expect(html).toContain('<form class="gate" id="gate" action="/api/subscribe" method="post">');
    expect(html).not.toMatch(/waitlist/i);
    for (const f of ["functions", "wrangler.toml", "migrations"]) expect(existsSync(join(here, f)), f).toBe(false);
    expect(existsSync(join(dist, "_headers"))).toBe(false);
    expect(existsSync(join(here, "api/subscribe.ts"))).toBe(true);
  });
  it("jedes Feld hat ein Label; E-Mail und Antwort sind Pflicht, Updates sind nicht vorangekreuzt, Honigtopf ist da", () => {
    const form = /<form[\s\S]*?<\/form>/.exec(html)?.[0] ?? "";
    const fields = form.match(/<(input|textarea)\b[^>]*>/g) ?? [];
    expect(fields.length).toBe(4);
    for (const tag of fields) {
      const id = /\sid="([\w-]+)"/.exec(tag)?.[1];
      expect(id, tag).toBeTruthy();
      expect(form, tag).toContain(`<label for="${id}">`);
    }
    expect(form).toMatch(/<input id="gate-email" name="email" type="email" required maxlength="254"/);
    expect(form).toMatch(/<textarea id="gate-answer" name="answer" required maxlength="500"/);
    expect(form).toMatch(/<input id="gate-updates" name="updates" type="checkbox" value="yes">/);
    expect(form).not.toMatch(/checked/);
    expect(form).toMatch(/<p class="hp" aria-hidden="true">[\s\S]*name="website" type="text" tabindex="-1" autocomplete="off"/);
    expect(form).toContain('<a href="/privacy">Privacy</a>');
    expect(form).toMatch(/<button class="button" type="submit">Send me the link/);
    expect(form).toMatch(/id="gate-status"[^>]*role="status" aria-live="polite"/);
  });
  it("Datenschutz nennt das Formular und den Auftragsverarbeiter, der neue Abschnitt ist zur Prüfung markiert", () => {
    const p = read("privacy.html");
    expect(p).toContain("<!-- review: Brevo section added 17.11. -->");
    for (const t of ["Sign-up form and e-mails", "Sendinblue SAS, 106 boulevard Haussmann, 75008 Paris, France", "Art. 6(1)(b) GDPR", "Art. 6(1)(a) GDPR", "Art. 6(1)(f) GDPR", "double opt-in", "deleted after 30 days", "data processing agreement with Brevo"]) expect(p, t).toContain(t);
    expect(p).not.toMatch(/has no forms/);
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
    expect(js).not.toMatch(/\beval\(|new Function|innerHTML|\.style\.|setAttribute\("style"|XMLHttpRequest|import\(/);
    // der einzige Netzwerkaufruf geht an das eigene Formularziel (connect-src 'self')
    expect((js.match(/fetch\(/g) ?? []).length).toBe(1);
    expect(js).toContain('fetch(gate.getAttribute("action")');
    expect(js).not.toMatch(/https?:\/\//);
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
  it("das Stylesheet ist wohlgeformt (Klammern ausgeglichen, keine verirrte schließende Klammer)", () => {
    let depth = 0;
    let min = 0;
    for (const ch of read("styles.css").replace(/\/\*[\s\S]*?\*\//g, "").replace(/"[^"]*"/g, "")) {
      if (ch === "{") depth++;
      if (ch === "}") depth--;
      min = Math.min(min, depth);
    }
    expect(min).toBe(0);
    expect(depth).toBe(0);
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
    const all = ["index.html", "imprint.html", "privacy.html", "welcome.html", "check-inbox.html", "try-again.html", "styles.css", "app.js"].map(read).join("\n");
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
      "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'",
    );
    expect(headers["Strict-Transport-Security"]).toBe("max-age=31536000; includeSubDomains");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
  });
  it("beide vercel.json (Projektwurzel und apps/landing) tragen dieselbe CSP", () => {
    const root = JSON.parse(readFileSync(join(here, "../../vercel.json"), "utf8"));
    const rootCsp = root.headers[0].headers.find((h: { key: string }) => h.key === "Content-Security-Policy").value;
    expect(rootCsp).toBe(headers["Content-Security-Policy"]);
    expect(rootCsp).toContain("script-src 'self'; style-src 'self'");
    expect(rootCsp).toContain("connect-src 'self'; form-action 'self'");
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
