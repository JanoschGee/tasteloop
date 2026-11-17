/**
 * Markenneutralitäts-Check: Code und UI dürfen keinen Markennamen enthalten.
 * Markennamen stehen nur in brands/*.yaml. Geprüft wird gegen alle Marken-IDs und -Namen
 * aus brands/*.yaml.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "yaml";

const CODE_DIRS = ["packages/core/src", "apps/web/app", "apps/web/components", "apps/web/lib", "apps/landing/src", "scripts", "ops", "templates", "brands", ".claude"];
const EXT = /\.(ts|tsx|js|mjs|cjs|css|html|plist|sh|json|yaml|yml)$/;

function walk(dir: string, acc: string[] = []): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (e === "node_modules" || e === ".next") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (EXT.test(e)) acc.push(p);
  }
  return acc;
}

/** Brand names from all real brand configs (brands/*.yaml except the example, plus docs/internal/brands). */
export function brandTerms(root: string): string[] {
  const terms = new Set<string>();
  for (const dir of ["brands", "docs/internal/brands"]) {
    let files: string[] = [];
    try {
      files = readdirSync(join(root, dir));
    } catch {
      continue;
    }
    for (const f of files) {
      if (!/\.ya?ml$/.test(f) || f === "example.yaml") continue;
      const cfg = parse(readFileSync(join(root, dir, f), "utf8"));
      const b = cfg?.brand ?? cfg?.marke; // "marke" = old German format
      if (b?.id) terms.add(String(b.id).toLowerCase());
      if (b?.name) terms.add(String(b.name).toLowerCase());
    }
  }
  return [...terms].filter((t) => t.length >= 3);
}

/** termsRoot: where the real brand configs live (for scanning an export without them) */
export function checkNeutral(root: string, termsRoot = root): string[] {
  const terms = brandTerms(termsRoot);
  const problems: string[] = [];
  for (const d of CODE_DIRS) {
    for (const f of walk(join(root, d))) {
      if (f.endsWith("check-neutral.ts")) continue;
      const text = readFileSync(f, "utf8").toLowerCase();
      for (const t of terms) {
        if (text.includes(t)) problems.push(`${relative(root, f)}: contains brand name "${t}"`);
      }
    }
  }
  return problems;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop()!);
if (isMain) {
  const root = process.cwd();
  const problems = checkNeutral(root);
  if (problems.length) {
    console.error("Brand-neutrality check failed:\n  " + problems.join("\n  "));
    process.exit(1);
  }
  console.log("Brand-neutrality check: code and UI contain no brand names.");
}
