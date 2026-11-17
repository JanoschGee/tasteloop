/**
 * Prüft, dass der öffentliche Teil des Repos nichts Internes enthält (Namen, Kunden, Hosts, Pfade).
 * Die Sperrliste steht in docs/internal/public-blocklist.txt, damit die Begriffe selbst nicht öffentlich sind.
 * Fehlt die Liste (z. B. im veröffentlichten Repo ohne docs/internal), wird die Prüfung übersprungen.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|pdf|zip)$/i;

export interface Blocklist {
  terms: string[];
  /** erlaubte Zeichenfolgen, die vor dem Prüfen entfernt werden (z. B. der öffentliche Repo-Link) */
  allow: string[];
  /** Dateien, die bewusst Namen enthalten dürfen (z. B. das gesetzlich vorgeschriebene Impressum) */
  files: string[];
}

/** Zeilenformat: Begriff | "allow: <zeichenfolge>" | "file: <pfad>" | "# Kommentar" */
export function blocklist(root: string): Blocklist | undefined {
  const p = join(root, "docs/internal/public-blocklist.txt");
  if (!existsSync(p)) return undefined;
  const lines = readFileSync(p, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  const pick = (prefix: string) => lines.filter((l) => l.startsWith(prefix)).map((l) => l.slice(prefix.length).trim().toLowerCase());
  return {
    terms: lines.filter((l) => !/^(allow|file):/.test(l)),
    allow: pick("allow:"),
    files: pick("file:"),
  };
}

export function publicFiles(root: string): string[] {
  const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" });
  return out
    .split("\0")
    .filter(Boolean)
    .filter((f) => !f.startsWith("docs/internal/") && !BINARY.test(f) && existsSync(join(root, f)));
}

export function checkPublic(root: string): string[] | undefined {
  const bl = blocklist(root);
  if (!bl) return undefined;
  const problems: string[] = [];
  for (const f of publicFiles(root)) {
    if (bl.files.includes(f.toLowerCase())) continue;
    if (statSync(join(root, f)).size > 2_000_000) continue;
    const lines = readFileSync(join(root, f), "utf8").split("\n");
    lines.forEach((line, i) => {
      let l = line.toLowerCase();
      for (const a of bl.allow) l = l.split(a).join("");
      for (const t of bl.terms) if (l.includes(t.toLowerCase())) problems.push(`${f}:${i + 1}: enthält „${t}“`);
    });
  }
  return problems;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop()!);
if (isMain) {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const problems = checkPublic(root);
  if (!problems) {
    console.log("Öffentlich-Check: übersprungen (keine Sperrliste in docs/internal).");
  } else if (problems.length) {
    console.error("Öffentlich-Check fehlgeschlagen:\n  " + problems.join("\n  "));
    process.exit(1);
  } else {
    console.log("Öffentlich-Check: nichts Internes im öffentlichen Teil.");
  }
}
