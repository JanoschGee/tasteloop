/** Betrieb: launchd-Plists, Installationsskript (nur Trockenlauf und Rendern, nichts wird installiert). */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "../../..");
const SCRIPT = join(REPO, "ops/install-macmini.sh");

describe("Installationsskript", () => {
  it("ist syntaktisch korrekt", () => {
    execFileSync("bash", ["-n", SCRIPT]);
  });

  it("rendert gültige LaunchDaemons ohne offene Platzhalter", () => {
    const out = mkdtempSync(join(tmpdir(), "ab-plists-"));
    execFileSync("bash", [SCRIPT, "--brand", "testmarke", "--vault", "/Users/branding/Vaults/v", "--render", out], {
      env: { ...process.env, CF_TEAM_DOMAIN: "team.cloudflareaccess.com", CF_AUD: "aud", CF_EMAILS: "a@x" },
    });
    const files = readdirSync(out).sort();
    expect(files).toEqual([
      "eu.tasteloop.testmarke.apply.plist",
      "eu.tasteloop.testmarke.bot.plist",
      "eu.tasteloop.testmarke.digest.plist",
      "eu.tasteloop.testmarke.obsidian-sync.plist",
      "eu.tasteloop.testmarke.tunnel.plist",
      "eu.tasteloop.testmarke.web.plist",
    ]);
    for (const f of files) {
      if (process.platform === "darwin") execFileSync("plutil", ["-lint", join(out, f)]);
      const text = readFileSync(join(out, f), "utf8");
      expect(text).not.toMatch(/__[A-Z_]+__/);
      expect(text).toContain("<key>UserName</key>\n\t<string>branding</string>");
    }
    const bot = readFileSync(join(out, files[1]), "utf8");
    expect(bot).toContain("<string>/Users/branding/tasteloop/packages/core/src/cli.ts</string>");
    expect(bot).toContain("<key>KeepAlive</key>\n\t<true/>");
    expect(bot).toContain("<string>/Users/branding/.config/tasteloop/brands/testmarke.yaml</string>");
    expect(bot).not.toContain("agentic-branding/brands");
    const web = readFileSync(join(out, files[5]), "utf8");
    expect(web).toContain("<string>127.0.0.1</string>");
    expect(web).toContain("<string>team.cloudflareaccess.com</string>");
    const sync = readFileSync(join(out, files[3]), "utf8");
    expect(sync).toContain("<string>--continuous</string>");
    const digest = readFileSync(join(out, files[2]), "utf8");
    expect(digest).toContain("<key>Weekday</key>\n\t\t<integer>1</integer>");
    // keine Secrets in Plists
    for (const f of files) expect(readFileSync(join(out, f), "utf8")).not.toMatch(/TOKEN|API_KEY/);
  });

  it("macht im Trockenlauf nichts und erklärt jeden Schritt", () => {
    const out = execFileSync("bash", [SCRIPT, "--brand", "testmarke"], { encoding: "utf8", env: { ...process.env, PATH: "/usr/bin:/bin:/usr/sbin:/opt/homebrew/bin" } });
    expect(out).toContain("Dry run");
    expect(out).toMatch(/would run: \S*brew install node@22 whisper-cpp ffmpeg cloudflared/);
    expect(out).toContain("(not changed)");
    expect(out).not.toMatch(/fdesetup (enable|disable)|autoLoginUser -|pmset|networksetup/);
    expect(out).toContain("would run: sudo launchctl bootstrap system /Library/LaunchDaemons/eu.tasteloop.testmarke.bot.plist");
    expect(out).not.toContain("+ sudo");
  });

  it("verändert nie FileVault, Auto-Login, Energie oder Netzwerk und nutzt keine reservierten Ports", () => {
    const script = readFileSync(SCRIPT, "utf8").split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
    expect(script).not.toMatch(/fdesetup (enable|disable)|defaults write .*loginwindow|pmset |networksetup /);
    expect(() => execFileSync("bash", [SCRIPT, "--brand", "t"], { stdio: "pipe", env: { ...process.env, WEB_PORT: "8123" } })).toThrow();
  });

  it("starts no services with --no-services", () => {
    const out = execFileSync("bash", [SCRIPT, "--brand", "testmarke", "--no-services"], { encoding: "utf8" });
    expect(out).toContain("Skipped (--no-services)");
    expect(out).not.toContain("launchctl bootstrap");
  });

  it("lehnt ungültige Marken-IDs ab", () => {
    expect(() => execFileSync("bash", [SCRIPT, "--brand", "Böse; rm -rf"], { stdio: "pipe" })).toThrow();
  });
});
