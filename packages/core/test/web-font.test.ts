/** Handschrift ist selbst gehostet (OFL), nicht über ein Google-CDN, und steht vorn im Font-Stack. */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WEB = resolve(__dirname, "../../../apps/web");

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

describe("Handschrift", () => {
  it("bindet Caveat aus dem eigenen Build ein und nennt sie zuerst", () => {
    expect(readFileSync(join(WEB, "app/layout.tsx"), "utf8")).toContain('import "@fontsource/caveat/latin-400.css"');
    expect(readFileSync(join(WEB, "app/globals.css"), "utf8")).toMatch(/--font-hand:\s*"Caveat"/);
  });
  it("lädt keine Schriften von Google", () => {
    const src = walk(join(WEB, "app")).concat(walk(join(WEB, "components")), walk(join(WEB, "lib")));
    for (const f of src) expect(readFileSync(f, "utf8"), f).not.toMatch(/fonts\.(googleapis|gstatic)\.com|next\/font\/google/);
  });
  it("liefert die woff2 im Build mit (falls gebaut)", () => {
    const media = join(WEB, ".next/static/media");
    if (!existsSync(media)) return; // ohne vorherigen Build nichts zu prüfen; verify baut danach
    expect(readdirSync(media).some((f) => f.endsWith(".woff2"))).toBe(true);
  });
});
