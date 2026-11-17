/** Das Markenzeichen: ein handgezogener Kreis, keine Ellipse, nie zweimal gleich, aber stabil pro Seed. */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { pencilCircle, seedOf } from "../../../apps/web/lib/pencil";

const REPO = resolve(__dirname, "../../..");

describe("Stiftkreis", () => {
  it("ist pro Seed stabil (Server und Browser zeichnen denselben Kreis)", () => {
    expect(pencilCircle(42, { width: 200, height: 100 }).d).toBe(pencilCircle(42, { width: 200, height: 100 }).d);
  });

  it("ist nie zweimal gleich", () => {
    const ds = new Set(["a", "b", "c", "d", "e"].map((s) => pencilCircle(seedOf(s), { width: 200, height: 100 }).d));
    expect(ds.size).toBe(5);
  });

  it("ist keine saubere Ellipse: Radius schwankt, Strich läuft über und schließt nicht exakt", () => {
    for (const seed of [1, 2, 3, 99, 2026]) {
      const { points } = pencilCircle(seed, { width: 200, height: 100 });
      // normierter Radius um die Mitte der Fläche
      const rs = points.map(([x, y]) => Math.hypot((x - 100) / 96, (y - 50) / 46));
      const spread = Math.max(...rs) - Math.min(...rs);
      expect(spread, `seed ${seed}`).toBeGreaterThan(0.03);
      expect(spread, `seed ${seed}`).toBeLessThan(0.35);
      const [x0, y0] = points[0];
      const [x1, y1] = points[points.length - 1];
      expect(Math.hypot(x1 - x0, y1 - y0), `seed ${seed}: Enden liegen nicht aufeinander`).toBeGreaterThan(2);
      // Überlappung: der Zug läuft mehr als eine volle Umdrehung
      const angles = points.map(([x, y]) => Math.atan2(y - 50, x - 100));
      let total = 0;
      for (let i = 1; i < angles.length; i++) {
        let d = angles[i] - angles[i - 1];
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        total += d;
      }
      expect(Math.abs(total), `seed ${seed}`).toBeGreaterThan(2 * Math.PI);
    }
  });

  it("Logo und Favicon sind echte SVG-Konturen in den Markenfarben, ohne Verläufe", () => {
    for (const f of ["apps/web/public/logo.svg", "apps/web/app/icon.svg"]) {
      const svg = readFileSync(join(REPO, f), "utf8");
      expect(svg).toMatch(/<path d="M[\d.\- ]+ C/);
      expect(svg).toContain("#E2231A");
      expect(svg).not.toMatch(/<ellipse|<circle|Gradient|filter/i);
    }
  });
});
