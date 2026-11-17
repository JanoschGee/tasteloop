/**
 * Mehrere Beitragende (Kern des Produkts): Stütze, Uneinig, Einzelstimme.
 * Fixtures mit drei Absendern: Anna, Ben, Cem.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { parseMd, stringifyMd } from "../src/frontmatter";
import { runApply } from "../src/jobs/apply";
import { digestTelegramText, runDigest, stuetzeText, stuetzeVon, validateUneinig } from "../src/jobs/digest";
import { writeUpload, type Upload } from "../src/vault/uploads";
import { ANALYSE_FIXTURE, makeServices, TINY_JPEG } from "./helpers";

type H = ReturnType<typeof makeServices>;

function seed(h: H, id: string, absender: string, begruendung: string): Upload {
  const bild = `${h.vault.dirs.bilder}/${id}.jpg`;
  h.vault.writeBytes(bild, TINY_JPEG);
  const u: Upload = {
    id, marke: "Testmarke", ebene: "brand", absender, datum: `2026-11-1${id.slice(-1)}T10:00:00`, status: "analysiert", bild,
    begruendung, transkript: [], korrekturen: [], analyse: ANALYSE_FIXTURE, extraSections: [],
  };
  writeUpload(h.vault, u);
  return u;
}

// Zustimmung: Anna (2x) und Ben loben warmes Seitenlicht.
// Widerspruch: Anna lobt Filmkorn, Cem kritisiert Filmkorn.
// Einzelstimme: nur Cem will eine Serif für Headlines.
const A1 = "20261110-1000-ann1";
const A2 = "20261111-1000-ann2";
const A3 = "20261112-1000-ann3";
const B1 = "20261113-1000-ben1";
const C1 = "20261114-1000-cem1";
const C2 = "20261115-1000-cem2";

function prepare() {
  const h = makeServices({ now: new Date(2026, 10, 17, 8, 0, 0) });
  seed(h, A1, "Anna", "Das warme Seitenlicht, genau so");
  seed(h, A2, "Anna", "Wieder Licht von der Seite");
  seed(h, A3, "Anna", "Das Korn macht es echt");
  seed(h, B1, "Ben", "Warmes Licht, gefällt mir");
  seed(h, C1, "Cem", "Zu viel Korn, wirkt schmutzig");
  seed(h, C2, "Cem", "Serif für Headlines wäre schön");
  return h;
}

const DIGEST = {
  zusammenfassung: "Drei Personen, ein klares Muster beim Licht, Streit ums Korn.",
  vorschlaege: [
    {
      titel: "Warmes Seitenlicht",
      abschnitt: "3. Look and Feel > Bildwelt",
      art: "ergaenzen" as const,
      neuer_text: "Licht kommt warm und von der Seite.",
      begruendung: "Anna und Ben unabhängig.",
      belege: [A1, A2, B1],
      // nur eine Seite belegt: kein Widerspruch, wird verworfen
      uneinig: [{ punkt: "Wie warm genau", pro: [A1], contra: [] }],
    },
    {
      titel: "Filmkorn",
      abschnitt: "3. Look and Feel > Farbe",
      art: "ergaenzen" as const,
      neuer_text: "Leichtes Filmkorn ist erwünscht.",
      begruendung: "Anna lobt das Korn.",
      belege: [A3],
      uneinig: [{ punkt: "Filmkorn", pro: [A3], contra: [C1] }],
    },
    {
      titel: "Serif für Headlines",
      abschnitt: "3. Look and Feel > Typografie",
      art: "ergaenzen" as const,
      neuer_text: "Headlines dürfen in einer Serif stehen.",
      begruendung: "Cem wünscht es sich.",
      belege: [C2],
      uneinig: [],
    },
  ],
  kern_hinweise: [],
  uneinig_ohne_vorschlag: [
    { punkt: "Wie viel Rot", pro: [B1], contra: [C2] },
    // dieselbe Person auf beiden Seiten ist kein Widerspruch zwischen Personen
    { punkt: "Anna mit sich selbst", pro: [A1], contra: [A2] },
  ],
};

const props = (h: H, p: string) => parseMd(h.vault.readText(p)).props;
const byTitle = (h: H, paths: string[], t: string) => paths.find((p) => props(h, p).titel === t)!;

function approve(h: H, path: string, extra: Record<string, unknown> = {}) {
  const doc = parseMd(h.vault.readText(path));
  Object.assign(doc.props, { status: "freigegeben", freigegeben_von: "Anna" }, extra);
  writeFileSync(join(h.root, path), stringifyMd(doc));
}

describe("Stütze", () => {
  it("zählt verschiedene Personen, nicht Bilder", () => {
    const h = prepare();
    const us = [A1, A2, B1].map((id) => ({ id, absender: id.includes("ann") ? "Anna" : "Ben" }) as Upload);
    expect(stuetzeVon(us)).toEqual({ personen: ["Anna", "Ben"], belege: 3, einzelstimme: false });
    expect(stuetzeText({ personen: 3, belege: 5 })).toBe("3 Personen, 5 Belege");
    expect(stuetzeText({ personen: 1, belege: 1 })).toBe("1 Person, 1 Beleg");
    void h;
  });

  it("steht als sortierbare Properties und als Zeile in der Vorschlagsnotiz", async () => {
    const h = prepare();
    h.llm.queue("digest", DIGEST);
    const r = await runDigest(h.svc);
    expect(r.vorschlaege).toHaveLength(3);
    const licht = byTitle(h, r.vorschlaege, "Warmes Seitenlicht");
    expect(props(h, licht)).toMatchObject({ stuetze_personen: 2, stuetze_belege: 3, stuetze_namen: ["Anna", "Ben"], einzelstimme: false, uneinig: 0 });
    expect(props(h, licht).uneinig_geklaert).toBeUndefined();
    expect(h.vault.readText(licht)).toContain("**Stütze:** 2 Personen, 3 Belege (Anna, Ben)");
    // die Bases-Ansicht sortiert danach
    const base = parse(h.vault.readText(h.vault.dirs.vorschlaegeAnsicht));
    expect(base.views[0].sort[0]).toEqual({ property: "note.stuetze_personen", direction: "DESC" });
    expect(base.views.map((v: { name: string }) => v.name)).toContain("Uneinig");
    // Prompt nennt, wie viele Personen beigetragen haben
    expect((h.llm.calls[0].content[1] as { text: string }).text).toContain("von 3 Personen");
  });
});

describe("Uneinig", () => {
  it("zeigt Widersprüche mit Belegen beider Seiten und verwirft Scheinwidersprüche", async () => {
    const h = prepare();
    h.llm.queue("digest", DIGEST);
    const r = await runDigest(h.svc);
    const korn = byTitle(h, r.vorschlaege, "Filmkorn");
    const text = h.vault.readText(korn);
    expect(props(h, korn)).toMatchObject({ uneinig: 1, uneinig_geklaert: false });
    expect(props(h, korn).tags).toContain("brand-system/uneinig");
    expect(text).toContain("## Uneinig");
    expect(text).toContain("### Filmkorn");
    expect(text).toMatch(/\*\*Dafür:\*\* \[\[[^\]]*ann3\|20261112-1000-ann3\]\] \(Anna\)/);
    expect(text).toMatch(/\*\*Dagegen:\*\* \[\[[^\]]*cem1\|20261114-1000-cem1\]\] \(Cem\)/);
    expect(text).toContain(`![[${h.vault.dirs.bilder}/${C1}.jpg|160]]`);
    // nur eine Seite belegt: verworfen, nicht als uneinig gezählt
    expect(props(h, byTitle(h, r.vorschlaege, "Warmes Seitenlicht")).uneinig).toBe(0);
    expect(r.verworfen.join()).toContain("Warmes Seitenlicht");
    // Uneinig ohne Vorschlag: nur der echte Widerspruch zwischen zwei Personen
    expect(r.uneinigOhneVorschlag).toBe(1);
    const digest = h.vault.readText(r.digestNotiz!);
    expect(digest).toContain("## Uneinig ohne Vorschlag");
    expect(digest).toContain("**Wie viel Rot:**");
    expect(digest).not.toContain("Anna mit sich selbst");
  });

  it("wird nie stillschweigend Regel: Übernahme erst nach uneinig_geklaert", async () => {
    const h = prepare();
    h.llm.queue("digest", DIGEST);
    const r = await runDigest(h.svc);
    const korn = byTitle(h, r.vorschlaege, "Filmkorn");
    const guide = join(h.root, "Marke/Brand Guide.md");
    const before = readFileSync(guide, "utf8");
    approve(h, korn);
    const res = runApply(h.svc);
    expect(res[0].status).toBe("uneinig");
    expect(readFileSync(guide, "utf8")).toBe(before);
    expect(props(h, korn).status).toBe("freigegeben");
    approve(h, korn, { uneinig_geklaert: true });
    expect(runApply(h.svc)[0].status).toBe("übernommen");
    expect(readFileSync(guide, "utf8")).toContain("Leichtes Filmkorn ist erwünscht.");
  });
});

describe("Einzelstimme", () => {
  it("wird markiert, aber nicht unterdrückt und lässt sich übernehmen", async () => {
    const h = prepare();
    h.llm.queue("digest", DIGEST);
    const r = await runDigest(h.svc);
    const serif = byTitle(h, r.vorschlaege, "Serif für Headlines");
    expect(props(h, serif)).toMatchObject({ einzelstimme: true, stuetze_personen: 1, stuetze_namen: ["Cem"] });
    expect(props(h, serif).tags).toContain("brand-system/einzelstimme");
    expect(h.vault.readText(serif)).toContain("> [!note] Einzelstimme\n> Nur Cem stützt diesen Vorschlag.");
    approve(h, serif);
    expect(runApply(h.svc)[0].status).toBe("übernommen");
  });

  it("Telegram-Hinweis nennt Stütze, Einzelstimme und Uneinigkeit", async () => {
    const h = prepare();
    h.llm.queue("digest", DIGEST);
    const t = digestTelegramText(h.svc, await runDigest(h.svc));
    expect(t).toContain("• Warmes Seitenlicht (2 Personen, 3 Belege)");
    expect(t).toContain("• Filmkorn (1 Person, 1 Beleg, Einzelstimme, ⚠️ uneinig)");
    expect(t).toContain("• Serif für Headlines (1 Person, 1 Beleg, Einzelstimme)");
    expect(t).toContain("1 weitere Punkte, bei denen ihr euch uneinig seid");
  });
});

describe("validateUneinig", () => {
  it("braucht zwei Seiten mit verschiedenen Personen", () => {
    const u = (id: string, a: string) => ({ id, absender: a }) as Upload;
    const m = new Map([u("a", "Anna"), u("b", "Ben"), u("a2", "Anna")].map((x) => [x.id, x]));
    expect(validateUneinig({ punkt: "x", pro: ["a"], contra: ["b"] }, m)?.pro.map((x) => x.id)).toEqual(["a"]);
    expect(validateUneinig({ punkt: "x", pro: ["a"], contra: ["a2"] }, m)).toBeUndefined();
    expect(validateUneinig({ punkt: "x", pro: ["a"], contra: ["erfunden"] }, m)).toBeUndefined();
    expect(validateUneinig({ punkt: "x", pro: ["a", "b"], contra: ["a2"] }, m)).toBeDefined();
  });
});
