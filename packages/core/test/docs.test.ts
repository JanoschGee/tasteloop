/** Öffentliche Doku: vollständig, Links gültig, Setup-Skill gültig, Befehle existieren. */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const REPO = resolve(__dirname, "../../..");
const DOCS = [
  "getting-started.md", "configuration.md", "brand-guide.md", "capturing.md", "digest-and-approval.md", "campaign-briefs.md",
  "agents.md", "gallery.md", "always-on.md", "security.md", "costs.md", "troubleshooting.md", "faq.md",
];
const PUBLIC_MD = ["README.md", ...DOCS.map((d) => `docs/${d}`), "templates/brand-guide.md", ".claude/skills/tasteloop-setup/SKILL.md", "apps/landing/README.md"];

describe("Öffentliche Doku", () => {
  it("alle vereinbarten Dokumente existieren", () => {
    for (const d of DOCS) expect(existsSync(join(REPO, "docs", d)), d).toBe(true);
    expect(existsSync(join(REPO, "templates/brand-guide.md"))).toBe(true);
    expect(existsSync(join(REPO, "LICENSE"))).toBe(true);
  });

  it("relative Links zeigen auf existierende Dateien", () => {
    for (const f of PUBLIC_MD) {
      const text = readFileSync(join(REPO, f), "utf8");
      for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = m[1].split("#")[0];
        if (!target || /^(https?:|mailto:)/.test(target)) continue;
        expect(existsSync(resolve(REPO, dirname(f), target)), `${f} → ${m[1]}`).toBe(true);
      }
    }
  });

  it("README verlinkt jedes Dokument", () => {
    const readme = readFileSync(join(REPO, "README.md"), "utf8");
    for (const d of DOCS) expect(readme, d).toContain(`docs/${d}`);
  });

  it("jeder in der Doku genannte npm-Befehl existiert", () => {
    const scripts = Object.keys(JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")).scripts);
    const webScripts = Object.keys(JSON.parse(readFileSync(join(REPO, "apps/web/package.json"), "utf8")).scripts);
    for (const f of PUBLIC_MD) {
      const text = readFileSync(join(REPO, f), "utf8");
      for (const m of text.matchAll(/npm run (?:-s )?([\w:-]+)( -w apps\/web)?/g)) {
        const list = m[2] ? webScripts : scripts;
        expect(list, `${f}: npm run ${m[1]}`).toContain(m[1]);
      }
    }
  });

  it("die Doku ist englisch und kennt keine alten Projektnamen", () => {
    for (const f of PUBLIC_MD) {
      const text = readFileSync(join(REPO, f), "utf8");
      expect(text, f).not.toMatch(/agentic-branding|Brand-Gedächtnis/);
    }
  });
});

describe("Setup-Skill für Claude Code", () => {
  const raw = readFileSync(join(REPO, ".claude/skills/tasteloop-setup/SKILL.md"), "utf8");
  const fm = parse(/^---\n([\s\S]*?)\n---/.exec(raw)![1]);

  it("hat gültiges Frontmatter und reagiert auf „set up tasteloop“", () => {
    expect(fm.name).toBe("tasteloop-setup");
    expect(fm.description).toContain("set up tasteloop");
    expect(String(fm.description).length).toBeLessThan(1024);
  });

  it("verbietet Secrets im Chat und lässt Bot und Keys den Menschen anlegen", () => {
    expect(raw).toMatch(/Never ask for, accept or repeat secrets in the chat/);
    expect(raw).toContain("@BotFather");
    expect(raw).toContain("~/.config/tasteloop/.env");
    expect(raw).not.toMatch(/cat ~\/\.config\/tasteloop\/\.env/);
  });

  it("deckt alle Schritte ab", () => {
    for (const s of ["prerequisites", "npm run ids", "npm run init-vault", "npm run doctor", "npm run bot", "First test upload", "Always on", "templates/brand-guide.md"]) {
      expect(raw, s).toContain(s);
    }
  });

  it("die Beispiel-Config ist für Fremde verständlich (englische Kommentare, keine echten Daten)", () => {
    const ex = readFileSync(join(REPO, "brands/example.yaml"), "utf8");
    expect(ex).toContain("NEVER put tokens or API keys here");
    // eingecheckt ist nur das Beispiel; eigene Configs sind per .gitignore ausgeschlossen
    const tracked = execFileSync("git", ["ls-files", "brands"], { cwd: REPO, encoding: "utf8" }).trim().split("\n");
    expect(tracked).toEqual(["brands/example.yaml"]);
  });
});
