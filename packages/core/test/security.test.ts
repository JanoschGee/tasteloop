/** Secrets nie in Repo oder Vault, Config strikt, Vault-Schreibschutz, Markenneutralität. */
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { ConfigError, loadSecrets, parseBrandConfig } from "../src/config";
import { findSecrets, isForbiddenFile, SecretLeakError } from "../src/secrets";
import { VaultPathError } from "../src/vault/vault";
import { checkRepo } from "../../../scripts/check-secrets";
import { checkNeutral, brandTerms } from "../../../scripts/check-neutral";
import { checkPublic } from "../../../scripts/check-public";
import { fixture, makeVault } from "./helpers";

const REPO = resolve(__dirname, "../../..");
// Test-Secrets werden zur Laufzeit zusammengesetzt, damit diese Datei selbst den Secret-Check besteht
const fakeTelegram = ["123456789", "AAH" + "x".repeat(32)].join(":");
const fakeAnthropic = "sk-" + "ant-api03-" + "y".repeat(40);

describe("Secret-Erkennung", () => {
  it("erkennt typische Tokens und Keys", () => {
    expect(findSecrets(`token ${fakeTelegram}`)[0].pattern).toBe("Telegram-Bot-Token");
    expect(findSecrets(fakeAnthropic)[0].pattern).toBe("Anthropic-API-Key");
    expect(findSecrets("-----BEGIN OPENSSH " + "PRIVATE KEY-----")).toHaveLength(1);
    expect(findSecrets("TELEGRAM_BOT_" + "TOKEN=abcdefghijklmnopqrstuvwxyz")).toHaveLength(1);
  });
  it("schlägt bei normalem Text nicht an", () => {
    expect(findSecrets("TELEGRAM_BOT_TOKEN=\nchat_id: -1001234567890\nFarbe #C8643B")).toEqual([]);
  });
  it("verbietet .env-Dateien, erlaubt .env.example", () => {
    expect(isForbiddenFile(".env")).toBe(true);
    expect(isForbiddenFile("apps/web/.env.local")).toBe(true);
    expect(isForbiddenFile(".env.example")).toBe(false);
  });
  it("Repo enthält keine Secrets (gleicher Check wie der Pre-Commit-Hook)", () => {
    expect(checkRepo(REPO)).toEqual([]);
  });
  it("Repo-Check findet ein eingeschmuggeltes Secret", () => {
    const dir = mkdtempSync(join(tmpdir(), "ab-repo-"));
    execFileSync("git", ["init", "-q"], { cwd: dir });
    writeFileSync(join(dir, "config.ts"), `const t = "${fakeTelegram}";\n`);
    writeFileSync(join(dir, ".env"), "X=1\n");
    const problems = checkRepo(dir);
    expect(problems.some((p) => p.startsWith("config.ts:1: Telegram"))).toBe(true);
    expect(problems.some((p) => p.startsWith(".env"))).toBe(true);
  });
  it(".gitignore schließt .env und Laufzeitdaten aus", () => {
    const out = execFileSync("git", ["check-ignore", ".env", "apps/web/.env.local", ".data/state.json"], { cwd: REPO, encoding: "utf8" });
    expect(out.trim().split("\n")).toHaveLength(3);
  });
});

describe("Vault-Schreibschutz", () => {
  it("weigert sich, Secrets in den Vault zu schreiben", () => {
    const { vault } = makeVault();
    expect(() => vault.writeText(vault.rel("Uploads/x.md"), `Token: ${fakeTelegram}`)).toThrow(SecretLeakError);
  });
  it("schreibt nur im Brand-Ordner, in den Guide und in den Papierkorb", () => {
    const { vault } = makeVault();
    expect(() => vault.writeText("Fremd.md", "x")).toThrow(VaultPathError);
    expect(() => vault.writeText("Marke/anderes.md", "x")).toThrow(VaultPathError);
    expect(() => vault.writeText("../ausserhalb.md", "x")).toThrow(VaultPathError);
    expect(() => vault.writeText(vault.rel("../../Fremd.md"), "x")).toThrow(VaultPathError);
    expect(() => vault.writeText(vault.rel("Uploads/ok.md"), "x")).not.toThrow();
    expect(() => vault.writeText("Marke/Brand Guide.md", "# x\n")).not.toThrow();
  });
});

describe("Marken-Config", () => {
  it("lehnt Secrets in der YAML ab", () => {
    const yaml = fixture("brand.yaml").replace("/wird/im/test/ersetzt", "/tmp/v") + `\nweb:\n  url: https://x.example\n# ${fakeAnthropic}\n`;
    expect(() => parseBrandConfig(yaml)).toThrow(/Secret/);
  });
  it("lehnt unbekannte Schlüssel ab (z. B. token)", () => {
    const yaml = fixture("brand.yaml").replace("/wird/im/test/ersetzt", "/tmp/v").replace("telegram:\n", "telegram:\n  token: abc\n");
    expect(() => parseBrandConfig(yaml)).toThrow(ConfigError);
  });
  it("verlangt relative Pfade ohne ..", () => {
    const yaml = fixture("brand.yaml").replace("/wird/im/test/ersetzt", "/tmp/v").replace('ordner: "Marke/Brand-System"', 'ordner: "../raus"');
    expect(() => parseBrandConfig(yaml)).toThrow(/relativ/);
  });
  it("die Beispiel-Config im Repo ist gültig", () => {
    const cfg = parseBrandConfig(readFileSync(join(REPO, "brands", "example.yaml"), "utf8"));
    expect(cfg.brand_guide.lernbereich.length + cfg.brand_guide.gesperrte_abschnitte.length).toBeGreaterThan(0);
  });
});

describe("Secrets laden", () => {
  it("liest .env außerhalb von Repo und Vault und warnt bei offenen Rechten", () => {
    const dir = mkdtempSync(join(tmpdir(), "ab-env-"));
    const f = join(dir, ".env");
    writeFileSync(f, `# Kommentar\nTELEGRAM_BOT_TOKEN="abc"\nANTHROPIC_API_KEY=def\n`);
    chmodSync(f, 0o644);
    const { secrets, warnings } = loadSecrets({ env: { TASTELOOP_ENV_FILE: f }, repoRoot: REPO, vaultRoot: "/tmp/kein-vault" });
    expect(secrets.telegramBotToken).toBe("abc");
    expect(secrets.anthropicApiKey).toBe("def");
    expect(warnings[0]).toContain("chmod 600");
  });
  it("verweigert eine .env im Vault", () => {
    const vault = mkdtempSync(join(tmpdir(), "ab-vault-env-"));
    mkdirSync(join(vault, "sub"));
    writeFileSync(join(vault, "sub", ".env"), "X=1\n");
    expect(() => loadSecrets({ env: { TASTELOOP_ENV_FILE: join(vault, "sub", ".env") }, repoRoot: REPO, vaultRoot: vault })).toThrow(/im Repo oder im Vault/);
  });
});

describe("Öffentlicher Teil", () => {
  it.skipIf(!existsSync(join(REPO, "docs/internal/public-blocklist.txt")))("enthält keine internen Namen, Kunden oder Hosts (Sperrliste in docs/internal)", () => {
    const r = checkPublic(REPO);
    expect(r).toBeDefined();
    expect(r).toEqual([]);
  });
  it("findet einen eingeschmuggelten internen Begriff, ignoriert docs/internal", () => {
    const dir = mkdtempSync(join(tmpdir(), "tl-public-"));
    execFileSync("git", ["init", "-q"], { cwd: dir });
    mkdirSync(join(dir, "docs/internal"), { recursive: true });
    writeFileSync(join(dir, "docs/internal/public-blocklist.txt"), "# Kommentar\ngeheimkunde\n");
    writeFileSync(join(dir, "docs/internal/notiz.md"), "geheimkunde intern ist ok\n");
    writeFileSync(join(dir, "README.md"), "Hallo\nFür GeheimKunde gebaut\n");
    expect(checkPublic(dir)).toEqual(["README.md:2: enthält „geheimkunde“"]);
    // Erlaubt-Liste und ausgenommene Datei
    writeFileSync(join(dir, "docs/internal/public-blocklist.txt"), "geheimkunde\nallow: github.com/geheimkunde/repo\nfile: legal/imprint.html\n");
    mkdirSync(join(dir, "legal"));
    writeFileSync(join(dir, "legal/imprint.html"), "GeheimKunde GmbH\n");
    writeFileSync(join(dir, "README.md"), "Code: https://github.com/GeheimKunde/repo\n");
    expect(checkPublic(dir)).toEqual([]);
    writeFileSync(join(dir, "README.md"), "Code: https://github.com/GeheimKunde/anderes\n");
    expect(checkPublic(dir)).toEqual(["README.md:1: enthält „geheimkunde“"]);
  });
  it("die Lizenz ist MIT", () => {
    expect(readFileSync(join(REPO, "LICENSE"), "utf8")).toMatch(/^MIT License\n\nCopyright \(c\) 2026 Tasteloop contributors/);
    expect(JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")).license).toBe("MIT");
  });
});

describe("Markenneutralität", () => {
  it("Code und UI enthalten keinen Markennamen aus brands/*.yaml", () => {
    // Im öffentlichen Repo gibt es nur brands/example.yaml, dann kann die Liste leer sein.
    expect(checkNeutral(REPO)).toEqual([]);
  });
});
