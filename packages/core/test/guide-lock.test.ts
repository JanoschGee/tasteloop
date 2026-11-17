/**
 * Locked core sections are never changed automatically. These tests secure the hard check.
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
const rules = { locked: ["Purpose", "1. Brand", "What we never say"], preamble_locked: true };

describe("parsing sections", () => {
  it("finds sections by path", () => {
    const g = parseGuide(guide);
    const colour = findSection(g, "3. Look and Feel > Colour")!;
    expect(colour.title).toBe("Colour");
    expect(sectionRef(colour)).toBe("3. Look and Feel > Colour");
    expect(findSection(g, "Colour")).toBe(colour);
  });

  it("ignores headings inside code blocks", () => {
    const g = parseGuide("# T\n\n## A\n\n```\n## not a section\n```\n\n## B\n");
    expect(g.sections.map((s) => s.title)).toEqual(["T", "A", "B"]);
  });

  it("returns nothing for ambiguous titles", () => {
    const g = parseGuide("# T\n\n## A\n\n### X\n\n## B\n\n### X\n");
    expect(findSection(g, "X")).toBeUndefined();
    expect(findSection(g, "B > X")?.path).toEqual(["T", "B", "X"]);
  });

  it("reports configured locks that don't exist in the guide", () => {
    expect(missingLocks(guide, { ...rules, locked: ["Purpose", "Does not exist"] })).toEqual(["Does not exist"]);
  });
});

describe("lock", () => {
  const g = parseGuide(guide);
  it("locks listed sections and their subsections", () => {
    expect(isLocked(findSection(g, "Purpose")!, rules)).toBe(true);
    expect(isLocked(findSection(g, "1. Brand")!, rules)).toBe(true);
    expect(isLocked(findSection(g, "Character")!, rules)).toBe(true);
    expect(isLocked(findSection(g, "What we never say")!, rules)).toBe(true);
  });
  it("leaves other sections editable", () => {
    expect(isLocked(findSection(g, "Colour")!, rules)).toBe(false);
    expect(isLocked(findSection(g, "Address")!, rules)).toBe(false);
    expect(isLocked(findSection(g, "2. Language")!, rules)).toBe(false);
  });
  it("compares headings case- and whitespace-insensitively", () => {
    expect(isLocked(findSection(g, "Character")!, { ...rules, locked: ["  1.  brand "] })).toBe(true);
  });
});

describe("applying a change", () => {
  it("extends an editable section and leaves everything else unchanged", () => {
    const out = applyChange(guide, { section: "3. Look and Feel > Colour", change: "extend", text: "No pure black, use charcoal." }, rules);
    expect(out).toContain("Terracotta as the accent.\n\nNo pure black, use charcoal.\n\n### Typography");
    expect(out.replace("\nNo pure black, use charcoal.\n", "")).toBe(guide);
  });

  it("replaces only the own text; subsections stay", () => {
    const out = applyChange(guide, { section: "3. Look and Feel", change: "replace", text: "Analogue, warm, close." }, rules);
    expect(out).toContain("## 3. Look and Feel\n\nAnalogue, warm, close.\n\n### Imagery\n\nReal people, no stock.");
  });

  it("replaces the last section of the file cleanly", () => {
    const out = applyChange(guide, { section: "4. Open", change: "replace", text: "- Logo decided." }, rules);
    expect(out.endsWith("## 4. Open\n\n- Logo decided.\n")).toBe(true);
  });

  it("refuses locked sections", () => {
    expect(() => applyChange(guide, { section: "Purpose", change: "replace", text: "We are quiet now." }, rules)).toThrow(LockedSectionError);
    expect(() => applyChange(guide, { section: "Character", change: "extend", text: "Also: cheeky." }, rules)).toThrow(LockedSectionError);
    expect(() => applyChange(guide, { section: "What we never say", change: "extend", text: "- x" }, rules)).toThrow(LockedSectionError);
  });

  it("refuses the title (preamble)", () => {
    expect(() => applyChange(guide, { section: "Brand Guide Testbrand", change: "replace", text: "new" }, rules)).toThrow(LockedSectionError);
  });

  it("refuses new headings in the text (they could fake locked sections)", () => {
    expect(() => applyChange(guide, { section: "Colour", change: "extend", text: "ok\n\n## Purpose\n\nHijacked." }, rules)).toThrow(ChangeError);
  });

  it("refuses unknown sections", () => {
    expect(() => applyChange(guide, { section: "Does not exist", change: "extend", text: "x" }, rules)).toThrow(ChangeError);
  });
});

describe("hard check assertLockedUnchanged", () => {
  it("accepts changes outside the core", () => {
    expect(() => assertLockedUnchanged(guide, guide.replace("We use first names.", "We always use first names."), rules)).not.toThrow();
  });
  it("detects any change in a locked section", () => {
    expect(() => assertLockedUnchanged(guide, guide.replace("boldly and warmly", "boldly and coldly"), rules)).toThrow(LockedSectionError);
  });
  it("detects changes in inherited subsections", () => {
    expect(() => assertLockedUnchanged(guide, guide.replace("Always lowercase.", "Always UPPERCASE."), rules)).toThrow(/1\. Brand/);
  });
  it("detects changes in the preamble", () => {
    expect(() => assertLockedUnchanged(guide, guide.replace("test fixture", "approved"), rules)).toThrow(/preamble/);
  });
  it("detects deleted locked sections", () => {
    const without = guide.replace(/## Purpose\n\nWe speak boldly and warmly. This is core.\n\n/, "");
    expect(() => assertLockedUnchanged(guide, without, rules)).toThrow(LockedSectionError);
  });
  it("detects renamed headings in the core", () => {
    expect(() => assertLockedUnchanged(guide, guide.replace("### Character", "### Personality"), rules)).toThrow(LockedSectionError);
  });
  it("detects injected locked sections", () => {
    const injected = guide.replace("### Typography", "### What we never say\n\n- Anything goes.\n\n### Typography");
    expect(() => assertLockedUnchanged(guide, injected, rules)).toThrow(LockedSectionError);
  });
  it("checks every single core line (fuzz)", () => {
    const lines = guide.split("\n");
    const g = parseGuide(guide);
    const lockedLines = new Set<number>();
    for (let i = 0; i < g.preambleEnd; i++) lockedLines.add(i);
    for (const s of g.sections) if (rules.locked.includes(s.title)) for (let i = s.headingLine; i < s.end; i++) lockedLines.add(i);
    for (const i of lockedLines) {
      if (lines[i].trim() === "") continue;
      const mutated = [...lines];
      mutated[i] = lines[i] + " (changed)";
      expect(() => assertLockedUnchanged(guide, mutated.join("\n"), rules), `line ${i + 1}: ${lines[i]}`).toThrow(LockedSectionError);
    }
  });
});
