/**
 * Lernschleife: Wochen-Digest -> Vorschlagsnotizen (Diff, Belege) -> Freigabe -> Übernahme.
 * Kern-Abschnitte werden nie automatisch geändert.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMd, stringifyMd } from "../src/frontmatter";
import { applyTelegramText, runApply } from "../src/jobs/apply";
import { digestTelegramText, isoWeek, NEUER_TEXT_START, runDigest } from "../src/jobs/digest";
import { analyseUpload } from "../src/jobs/analyse";
import { listUploads, writeUpload, type Upload } from "../src/vault/uploads";
import { ANALYSE_FIXTURE, makeServices, TINY_JPEG } from "./helpers";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

function seedUpload(h: ReturnType<typeof makeServices>, id: string, patch: Partial<Upload> = {}) {
  const bild = `${h.vault.dirs.bilder}/${id}.jpg`;
  h.vault.writeBytes(bild, TINY_JPEG);
  const u: Upload = {
    id,
    marke: "Testmarke",
    ebene: "brand",
    absender: "Anna",
    datum: `2026-11-1${id.slice(-1)}T10:00:00`,
    status: "analysiert",
    bild,
    begruendung: "Warm und analog",
    transkript: [],
    korrekturen: [],
    analyse: ANALYSE_FIXTURE,
    extraSections: [],
    ...patch,
  };
  writeUpload(h.vault, u);
  return u;
}

const DIGEST = {
  zusammenfassung: "Mehrere Uploads zeigen warmes Seitenlicht und Filmkorn.",
  vorschlaege: [
    {
      titel: "Filmkorn als Regel",
      abschnitt: "3. Look and Feel > Farbe",
      art: "ergaenzen" as const,
      neuer_text: "Leichtes Filmkorn ist erwünscht, nie digital glatt.",
      begruendung: "Zwei Uploads loben die analoge Körnung.",
      belege: ["20261110-1000-aaa1", "20261111-1000-aaa2", "erfunden-123"],
      uneinig: [],
    },
    {
      titel: "Leitgedanke umdrehen",
      abschnitt: "Leitgedanke",
      art: "ersetzen" as const,
      neuer_text: "Wir sind jetzt leise.",
      begruendung: "Ein Upload war leise.",
      belege: ["20261110-1000-aaa1"],
      uneinig: [],
    },
    {
      titel: "Ohne Beleg",
      abschnitt: "Anrede",
      art: "ergaenzen" as const,
      neuer_text: "Wir siezen nie.",
      begruendung: "Bauchgefühl.",
      belege: ["gibt-es-nicht"],
      uneinig: [],
    },
  ],
  kern_hinweise: [],
  uneinig_ohne_vorschlag: [],
};

function prepare() {
  const h = makeServices({ now: new Date(2026, 10, 16, 8, 0, 0) });
  seedUpload(h, "20261110-1000-aaa1");
  seedUpload(h, "20261111-1000-aaa2", { absender: "Ben" });
  seedUpload(h, "20261112-1000-bbb3", { ebene: "kampagne" });
  seedUpload(h, "20261113-1000-ccc4", { status: "fehler" });
  return h;
}

function proposalPaths(h: ReturnType<typeof makeServices>) {
  return readdirSync(join(h.root, h.vault.dirs.vorschlaege))
    .filter((f) => f.endsWith(".md") && !f.includes("Wochen-Digest"))
    .map((f) => `${h.vault.dirs.vorschlaege}/${f}`);
}

function approve(h: ReturnType<typeof makeServices>, path: string, props: Record<string, unknown> = {}) {
  const doc = parseMd(h.vault.readText(path));
  Object.assign(doc.props, { status: "freigegeben", freigegeben_von: "Anna" }, props);
  writeFileSync(join(h.root, path), stringifyMd(doc));
}

const guidePath = (h: ReturnType<typeof makeServices>) => join(h.root, "Marke/Brand Guide.md");

describe("Wochen-Digest", () => {
  it("liest nur neue, analysierte Brand-Uploads und legt Vorschläge mit Diff und Belegbildern an", async () => {
    const h = prepare();
    h.llm.queue("digest", DIGEST);
    const r = await runDigest(h.svc);
    expect(r.uploads).toBe(2);
    expect(r.vorschlaege).toHaveLength(1);
    // Prompt: Guide mit Sperrvermerken, nur Brand-Uploads
    const call = h.llm.calls[0];
    const text = call.content.map((c) => (c.type === "text" ? c.text : "")).join("\n");
    expect(text).toContain("- Leitgedanke [gesperrt]");
    expect(text).toContain("- 3. Look and Feel > Farbe [bearbeitbar]");
    expect(text).toContain('id="20261110-1000-aaa1"');
    expect(text).not.toContain("bbb3");
    expect(text).not.toContain("ccc4");

    const { props, body } = parseMd(h.vault.readText(r.vorschlaege[0]));
    expect(props).toMatchObject({ typ: "vorschlag", status: "offen", abschnitt: "3. Look and Feel > Farbe", art: "ergaenzen", freigegeben_von: "", digest: isoWeek(new Date(2026, 10, 16)) });
    // nur echte Belege, erfundene IDs fliegen raus
    expect(props.belege).toEqual(["[[Marke/Brand-System/Uploads/20261110-1000-aaa1]]", "[[Marke/Brand-System/Uploads/20261111-1000-aaa2]]"]);
    expect(body).toContain("```diff\n  Warmes Off-White als Grund.\n  Akzent in Terrakotta.\n+ \n+ Leichtes Filmkorn ist erwünscht, nie digital glatt.\n```");
    expect(body).toContain("![[Marke/Brand-System/Uploads/Bilder/20261110-1000-aaa1.jpg|240]]");
    expect(body).toContain("freigegeben_von");
  });

  it("macht aus Vorschlägen für gesperrte Abschnitte nur Kern-Hinweise und verwirft unbelegte", async () => {
    const h = prepare();
    h.llm.queue("digest", DIGEST);
    const r = await runDigest(h.svc);
    expect(r.kernHinweise).toBe(1);
    expect(r.verworfen.join()).toContain("Ohne Beleg");
    expect(proposalPaths(h).some((p) => p.includes("Leitgedanke"))).toBe(false);
    const digest = h.vault.readText(r.digestNotiz!);
    expect(digest).toContain("## Kern-Hinweise (gesperrt, nur manuell)");
    expect(digest).toContain("**Leitgedanke:** Leitgedanke umdrehen");
  });

  it("markiert gelesene Uploads und liest sie beim nächsten Mal nicht erneut", async () => {
    const h = prepare();
    h.llm.queue("digest", DIGEST);
    await runDigest(h.svc);
    const uploads = listUploads(h.vault);
    expect(uploads.find((u) => u.id === "20261110-1000-aaa1")!.status).toBe("im-digest");
    const r2 = await runDigest(h.svc);
    expect(r2.uploads).toBe(0);
    expect(h.llm.calls).toHaveLength(1);
    expect(digestTelegramText(h.svc, r2)).toContain("keine neuen Brand-Uploads");
  });

  it("Digest-Hinweis für Telegram nennt Anzahl und Titel", async () => {
    const h = prepare();
    h.llm.queue("digest", DIGEST);
    const r = await runDigest(h.svc);
    const t = digestTelegramText(h.svc, r);
    expect(t).toContain("2 neue Brand-Uploads, 1 Vorschläge, 1 Kern-Hinweise");
    expect(t).toContain("• Filmkorn als Regel");
  });

  it("eine Neuanalyse nach dem Digest hält den Status im-digest", async () => {
    const h = prepare();
    h.llm.queue("digest", DIGEST);
    await runDigest(h.svc);
    const r = await analyseUpload(h.svc, "20261110-1000-aaa1");
    expect(r.upload.status).toBe("im-digest");
  });
});

describe("Übernahme nach Freigabe", () => {
  async function withProposal() {
    const h = prepare();
    h.llm.queue("digest", DIGEST);
    await runDigest(h.svc);
    const [p] = proposalPaths(h);
    return { h, p };
  }

  it("ändert nichts ohne Freigabe", async () => {
    const { h } = await withProposal();
    const before = readFileSync(guidePath(h), "utf8");
    expect(runApply(h.svc)).toEqual([]);
    expect(readFileSync(guidePath(h), "utf8")).toBe(before);
  });

  it("übernimmt nach status: freigegeben, protokolliert und sichert die alte Fassung", async () => {
    const { h, p } = await withProposal();
    const before = readFileSync(guidePath(h), "utf8");
    approve(h, p);
    const backup = mkdtempSync(join(tmpdir(), "ab-backup-"));
    const res = runApply(h.svc, { backupDir: backup });
    expect(res).toHaveLength(1);
    expect(res[0].status).toBe("übernommen");
    const after = readFileSync(guidePath(h), "utf8");
    expect(after).toContain("Akzent in Terrakotta.\n\nLeichtes Filmkorn ist erwünscht, nie digital glatt.\n\n### Typografie");
    expect(readdirSync(backup)).toHaveLength(1);
    expect(readFileSync(join(backup, readdirSync(backup)[0]), "utf8")).toBe(before);
    const { props, body } = parseMd(h.vault.readText(p));
    expect(props.status).toBe("übernommen");
    expect(props.uebernommen_am).toBe("2026-11-16T08:00:00");
    expect(body).toContain("## Protokoll");
    const log = h.vault.readText(h.vault.dirs.aenderungslog);
    expect(log).toContain("**Filmkorn als Regel** in „3. Look and Feel > Farbe“ (ergaenzen, freigegeben von Anna)");
    // zweiter Lauf tut nichts mehr
    expect(runApply(h.svc)).toEqual([]);
    expect(applyTelegramText(res)).toContain("✅ Filmkorn als Regel");
  });

  it("übernimmt den vom Menschen angepassten Text", async () => {
    const { h, p } = await withProposal();
    const doc = parseMd(h.vault.readText(p));
    doc.body = doc.body.replace(`${NEUER_TEXT_START}\nLeichtes Filmkorn ist erwünscht, nie digital glatt.`, `${NEUER_TEXT_START}\nFilmkorn: ja, aber dezent.`);
    writeFileSync(join(h.root, p), stringifyMd(doc));
    approve(h, p);
    runApply(h.svc);
    expect(readFileSync(guidePath(h), "utf8")).toContain("Filmkorn: ja, aber dezent.");
  });

  it("verlangt freigegeben_von aus der Liste der Freigebenden", async () => {
    const { h, p } = await withProposal();
    const before = readFileSync(guidePath(h), "utf8");
    approve(h, p, { freigegeben_von: "Ben" });
    const res = runApply(h.svc);
    expect(res[0].status).toBe("nicht-berechtigt");
    expect(readFileSync(guidePath(h), "utf8")).toBe(before);
    // Status bleibt freigegeben, nach Korrektur des Namens greift der nächste Lauf
    approve(h, p, { freigegeben_von: "anna" });
    expect(runApply(h.svc)[0].status).toBe("übernommen");
  });

  it("KERN: auch ein von Hand auf einen gesperrten Abschnitt umgebogener Vorschlag ändert den Guide nie", async () => {
    const { h, p } = await withProposal();
    const before = readFileSync(guidePath(h), "utf8");
    for (const abschnitt of ["Leitgedanke", "1. Marke > Charakter", "Was wir nie sagen", "Brand Guide Testmarke"]) {
      approve(h, p, { abschnitt, art: "ersetzen", alt_hash: undefined });
      const res = runApply(h.svc);
      expect(res[0].status, abschnitt).toBe("gesperrt");
      expect(readFileSync(guidePath(h), "utf8"), abschnitt).toBe(before);
    }
    expect(h.vault.readText(h.vault.dirs.aenderungslog)).not.toContain("Filmkorn");
  });

  it("KERN: Text mit eingeschleuster Überschrift wird abgelehnt", async () => {
    const { h, p } = await withProposal();
    const before = readFileSync(guidePath(h), "utf8");
    const doc = parseMd(h.vault.readText(p));
    doc.body = doc.body.replace(`${NEUER_TEXT_START}\nLeichtes Filmkorn ist erwünscht, nie digital glatt.`, `${NEUER_TEXT_START}\nok\n\n## Leitgedanke\n\nGekapert.`);
    writeFileSync(join(h.root, p), stringifyMd(doc));
    approve(h, p);
    expect(runApply(h.svc)[0].status).toBe("fehler");
    expect(readFileSync(guidePath(h), "utf8")).toBe(before);
  });

  it("erkennt Konflikte, wenn der Abschnitt seit dem Vorschlag geändert wurde (ersetzen)", async () => {
    const { h, p } = await withProposal();
    approve(h, p, { art: "ersetzen" });
    writeFileSync(guidePath(h), readFileSync(guidePath(h), "utf8").replace("Akzent in Terrakotta.", "Akzent in Salbei."));
    const before = readFileSync(guidePath(h), "utf8");
    expect(runApply(h.svc)[0].status).toBe("konflikt");
    expect(readFileSync(guidePath(h), "utf8")).toBe(before);
  });

  it("schreibt außerhalb von Brand-Ordner und Guide nichts", async () => {
    const { h, p } = await withProposal();
    approve(h, p);
    runApply(h.svc);
    expect(readFileSync(join(h.root, "Fremd.md"), "utf8")).toBe("Diese Datei gehört nicht zum Brand-System.\n");
  });
});
