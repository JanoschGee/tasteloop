/**
 * Gesperrte Kern-Abschnitte dürfen nie automatisch geändert werden.
 * Diese Tests sichern die harte Prüfung ab.
 */
import { describe, expect, it } from "vitest";
import {
  applyChange,
  assertLockedUnchanged,
  ChangeError,
  findSection,
  isLocked,
  LockedSectionError,
  missingLocks,
  parseGuide,
  sectionRef,
} from "../src/guide/sections";
import { fixture } from "./helpers";

const guide = fixture("guide.md");
const rules = { gesperrte_abschnitte: ["Leitgedanke", "1. Marke", "Was wir nie sagen"], praeambel_gesperrt: true };

describe("Abschnitte parsen", () => {
  it("findet Abschnitte mit Pfad", () => {
    const g = parseGuide(guide);
    const farbe = findSection(g, "3. Look and Feel > Farbe")!;
    expect(farbe.title).toBe("Farbe");
    expect(sectionRef(farbe)).toBe("3. Look and Feel > Farbe");
    expect(findSection(g, "Farbe")).toBe(farbe);
  });

  it("ignoriert Überschriften in Code-Blöcken", () => {
    const g = parseGuide("# T\n\n## A\n\n```\n## kein Abschnitt\n```\n\n## B\n");
    expect(g.sections.map((s) => s.title)).toEqual(["T", "A", "B"]);
  });

  it("liefert bei mehrdeutigen Titeln nichts", () => {
    const g = parseGuide("# T\n\n## A\n\n### X\n\n## B\n\n### X\n");
    expect(findSection(g, "X")).toBeUndefined();
    expect(findSection(g, "B > X")?.path).toEqual(["T", "B", "X"]);
  });

  it("meldet konfigurierte Sperren, die es im Guide nicht gibt", () => {
    expect(missingLocks(guide, { ...rules, gesperrte_abschnitte: ["Leitgedanke", "Gibt es nicht"] })).toEqual(["Gibt es nicht"]);
  });
});

describe("Sperre", () => {
  const g = parseGuide(guide);
  it("sperrt gelistete Abschnitte und vererbt an Unterabschnitte", () => {
    expect(isLocked(findSection(g, "Leitgedanke")!, rules)).toBe(true);
    expect(isLocked(findSection(g, "1. Marke")!, rules)).toBe(true);
    expect(isLocked(findSection(g, "Charakter")!, rules)).toBe(true);
    expect(isLocked(findSection(g, "Was wir nie sagen")!, rules)).toBe(true);
  });
  it("lässt andere Abschnitte bearbeitbar", () => {
    expect(isLocked(findSection(g, "Farbe")!, rules)).toBe(false);
    expect(isLocked(findSection(g, "Anrede")!, rules)).toBe(false);
    expect(isLocked(findSection(g, "2. Sprache")!, rules)).toBe(false);
  });
  it("vergleicht Überschriften unabhängig von Groß-/Kleinschreibung und Leerzeichen", () => {
    expect(isLocked(findSection(g, "Charakter")!, { ...rules, gesperrte_abschnitte: ["  1.  marke "] })).toBe(true);
  });
});

describe("Änderung anwenden", () => {
  it("ergänzt einen freien Abschnitt und lässt alles andere unverändert", () => {
    const out = applyChange(guide, { abschnitt: "3. Look and Feel > Farbe", art: "ergaenzen", text: "Kein reines Schwarz, sondern Anthrazit." }, rules);
    expect(out).toContain("Akzent in Terrakotta.\n\nKein reines Schwarz, sondern Anthrazit.\n\n### Typografie");
    // alles außer dem Farbabschnitt identisch
    expect(out.replace("\nKein reines Schwarz, sondern Anthrazit.\n", "")).toBe(guide);
  });

  it("ersetzt nur den eigenen Text, Unterabschnitte bleiben", () => {
    const out = applyChange(guide, { abschnitt: "3. Look and Feel", art: "ersetzen", text: "Analog, warm, nah." }, rules);
    expect(out).toContain("## 3. Look and Feel\n\nAnalog, warm, nah.\n\n### Bildwelt\n\nEchte Menschen, kein Stock.");
  });

  it("ersetzt den letzten Abschnitt der Datei sauber", () => {
    const out = applyChange(guide, { abschnitt: "4. Offen", art: "ersetzen", text: "- Logo entschieden." }, rules);
    expect(out.endsWith("## 4. Offen\n\n- Logo entschieden.\n")).toBe(true);
  });

  it("verweigert gesperrte Abschnitte", () => {
    expect(() => applyChange(guide, { abschnitt: "Leitgedanke", art: "ersetzen", text: "Wir sind jetzt leise." }, rules)).toThrow(LockedSectionError);
    expect(() => applyChange(guide, { abschnitt: "Charakter", art: "ergaenzen", text: "Auch: frech." }, rules)).toThrow(LockedSectionError);
    expect(() => applyChange(guide, { abschnitt: "Was wir nie sagen", art: "ergaenzen", text: "- x" }, rules)).toThrow(LockedSectionError);
  });

  it("verweigert den Titel (Präambel)", () => {
    expect(() => applyChange(guide, { abschnitt: "Brand Guide Testmarke", art: "ersetzen", text: "neu" }, rules)).toThrow(LockedSectionError);
  });

  it("verweigert neue Überschriften im Text (sie könnten gesperrte Abschnitte vortäuschen)", () => {
    expect(() =>
      applyChange(guide, { abschnitt: "Farbe", art: "ergaenzen", text: "ok\n\n## Leitgedanke\n\nGekapert." }, rules),
    ).toThrow(ChangeError);
  });

  it("verweigert unbekannte Abschnitte", () => {
    expect(() => applyChange(guide, { abschnitt: "Gibt es nicht", art: "ergaenzen", text: "x" }, rules)).toThrow(ChangeError);
  });
});

describe("harte Prüfung assertLockedUnchanged", () => {
  it("akzeptiert Änderungen außerhalb des Kerns", () => {
    expect(() => assertLockedUnchanged(guide, guide.replace("Wir duzen.", "Wir duzen immer."), rules)).not.toThrow();
  });
  it("erkennt jede Änderung im gesperrten Abschnitt", () => {
    expect(() => assertLockedUnchanged(guide, guide.replace("mutig und warm", "mutig und kalt"), rules)).toThrow(LockedSectionError);
  });
  it("erkennt Änderungen in vererbten Unterabschnitten", () => {
    expect(() => assertLockedUnchanged(guide, guide.replace("Immer klein geschrieben.", "Immer GROSS."), rules)).toThrow(/1\. Marke/);
  });
  it("erkennt Änderungen in der Präambel", () => {
    expect(() => assertLockedUnchanged(guide, guide.replace("Fixture für Tests", "Freigegeben"), rules)).toThrow(/Präambel/);
  });
  it("erkennt gelöschte gesperrte Abschnitte", () => {
    const without = guide.replace(/## Leitgedanke\n\nWir sprechen mutig und warm. Das ist Kern.\n\n/, "");
    expect(() => assertLockedUnchanged(guide, without, rules)).toThrow(LockedSectionError);
  });
  it("erkennt umbenannte Überschriften im Kern", () => {
    expect(() => assertLockedUnchanged(guide, guide.replace("### Charakter", "### Persönlichkeit"), rules)).toThrow(LockedSectionError);
  });
  it("erkennt neu eingeschleuste gesperrte Abschnitte", () => {
    const injected = guide.replace("### Typografie", "### Was wir nie sagen\n\n- Alles erlaubt.\n\n### Typografie");
    expect(() => assertLockedUnchanged(guide, injected, rules)).toThrow(LockedSectionError);
  });
  it("prüft jede einzelne Kernzeile (Fuzz)", () => {
    const lines = guide.split("\n");
    const g = parseGuide(guide);
    const lockedLines = new Set<number>();
    for (let i = 0; i < g.preambleEnd; i++) lockedLines.add(i);
    for (const s of g.sections) if (rules.gesperrte_abschnitte.includes(s.title)) for (let i = s.headingLine; i < s.end; i++) lockedLines.add(i);
    for (const i of lockedLines) {
      if (lines[i].trim() === "") continue;
      const mutated = [...lines];
      mutated[i] = lines[i] + " (geändert)";
      expect(() => assertLockedUnchanged(guide, mutated.join("\n"), rules), `Zeile ${i + 1}: ${lines[i]}`).toThrow(LockedSectionError);
    }
  });
});
