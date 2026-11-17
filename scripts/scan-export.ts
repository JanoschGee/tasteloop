/**
 * Scans a public export with the internal lists of this repo:
 * blocklist from docs/internal/public-blocklist.txt and brand names from the real brand configs.
 * Usage: tsx scripts/scan-export.ts <export-dir>
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { checkNeutral } from "./check-neutral";
import { checkPublic } from "./check-public";

const source = resolve(import.meta.dirname, "..");
const target = process.argv[2] ? resolve(process.argv[2]) : "";
if (!target || !existsSync(target)) {
  console.error("Usage: tsx scripts/scan-export.ts <export-dir>");
  process.exit(2);
}
if (existsSync(resolve(target, "docs/internal"))) {
  console.error("Export scan failed: docs/internal exists in the export.");
  process.exit(1);
}
const pub = checkPublic(target, source);
if (!pub) {
  console.error("Export scan failed: no blocklist found in docs/internal of the source repo.");
  process.exit(1);
}
const problems = [...pub, ...checkNeutral(target, source)];
if (problems.length) {
  console.error("Export scan failed:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log("Export scan: nothing internal, no brand names.");
