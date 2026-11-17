/**
 * Secret-Check: prüft alle Dateien, die eingecheckt sind oder eingecheckt würden
 * (git ls-files: getrackt + neu, ohne .gitignore-Treffer).
 * Aufruf: npm run check:secrets   (läuft auch als Pre-Commit-Hook und als Test)
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { findSecrets, isForbiddenFile } from "../packages/core/src/secrets";

const BINARY = /\.(png|jpe?g|gif|webp|ico|oga|ogg|mp3|wav|woff2?|ttf|pdf|zip)$/i;

export function checkRepo(root: string): string[] {
  const out = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8" },
  );
  const files = out.split("\0").filter(Boolean);
  const problems: string[] = [];
  for (const f of files) {
    if (isForbiddenFile(f)) {
      problems.push(`${f}: this file type must never be committed`);
      continue;
    }
    if (BINARY.test(f)) continue;
    const abs = join(root, f);
    let text: string;
    try {
      if (statSync(abs).size > 2_000_000) continue;
      text = readFileSync(abs, "utf8");
    } catch {
      continue; // gelöscht, aber noch im Index
    }
    for (const finding of findSecrets(text)) {
      problems.push(`${f}:${finding.line}: ${finding.pattern}`);
    }
  }
  return problems;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop()!);
if (isMain) {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const problems = checkRepo(root);
  if (problems.length) {
    console.error("Secret check failed:\n  " + problems.join("\n  "));
    process.exit(1);
  }
  console.log("Secret check: no secrets found.");
}
