/**
 * Wochen-Digest: liest neue Brand-Uploads, lässt Claude Änderungsvorschläge
 * ableiten und legt pro Vorschlag eine Notiz an (Diff gegen den Guide, Belegbilder).
 * Vorschläge zu gesperrten Abschnitten werden nie als übernehmbarer Vorschlag angelegt.
 */
import { diffLines } from "diff";
import { stringifyMd, parseMd } from "../frontmatter";
import { lockRules, readGuide, sectionIndex } from "../guide/context";
import { findSection, hash, isEditable, isLocked, ownBody, parseGuide, sectionRef } from "../guide/sections";
import { kostenUsd } from "../llm/client";
import { DigestSchema } from "../llm/prompts";
import { digestSystem } from "../llm/prompts";
import type { Services } from "../services";
import { localDate, slug, wikilink } from "../util";
import { listUploads, renderAnalyse, uploadNotePath, writeUpload, type Upload } from "../vault/uploads";
import type { z } from "zod";
import type { Vault } from "../vault/vault";

export type DigestAntwort = z.infer<typeof DigestSchema>;

export const NEUER_TEXT_START = "<!-- neuer-text:start -->";
export const NEUER_TEXT_END = "<!-- neuer-text:end -->";

export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function renderDiff(oldText: string, newText: string): string {
  const parts = diffLines(oldText.trim() + "\n", newText.trim() + "\n");
  const out: string[] = [];
  for (const p of parts) {
    const lines = p.value.replace(/\n$/, "").split("\n");
    const prefix = p.added ? "+ " : p.removed ? "- " : "  ";
    for (const l of lines) out.push(prefix + l);
  }
  return out.join("\n");
}

export interface Stuetze {
  personen: string[];
  belege: number;
  einzelstimme: boolean;
}

/** Stütze aus den Belegen: verschiedene Personen und Anzahl Belege (berechnet, nicht vom Modell). */
export function stuetzeVon(belege: Upload[]): Stuetze {
  const personen = [...new Set(belege.map((u) => u.absender))].sort((a, b) => a.localeCompare(b, "de"));
  return { personen, belege: belege.length, einzelstimme: personen.length === 1 };
}

export function stuetzeText(s: { personen: number | string[]; belege: number }): string {
  const n = typeof s.personen === "number" ? s.personen : s.personen.length;
  return `${n} ${n === 1 ? "Person" : "Personen"}, ${s.belege} ${s.belege === 1 ? "Beleg" : "Belege"}`;
}

export interface UneinigPunkt {
  punkt: string;
  pro: Upload[];
  contra: Upload[];
}

/**
 * Prüft einen gemeldeten Widerspruch: beide Seiten belegt, und mindestens eine Person auf der
 * einen Seite ist eine andere als auf der anderen. Sonst ist es kein Widerspruch zwischen Personen.
 */
export function validateUneinig(raw: { punkt: string; pro: string[]; contra: string[] }, byId: Map<string, Upload>): UneinigPunkt | undefined {
  const pro = [...new Set(raw.pro)].map((i) => byId.get(i)).filter((u): u is Upload => !!u);
  const contra = [...new Set(raw.contra)].map((i) => byId.get(i)).filter((u): u is Upload => !!u);
  if (!pro.length || !contra.length) return undefined;
  const pp = new Set(pro.map((u) => u.absender));
  const cp = new Set(contra.map((u) => u.absender));
  const zwischenPersonen = [...pp].some((a) => [...cp].some((b) => a !== b));
  return zwischenPersonen ? { punkt: raw.punkt, pro, contra } : undefined;
}

function seite(v: Vault, us: Upload[]): string {
  return us.map((u) => `[[${uploadNotePath(v, u.id).replace(/\.md$/, "")}|${u.id}]] (${u.absender})`).join(", ");
}

export interface DigestErgebnis {
  vorschlaege: string[];
  /** je Vorschlag: Titel, Stütze, Zahl uneiniger Punkte */
  details: { path: string; titel: string; personen: number; belege: number; einzelstimme: boolean; uneinig: number }[];
  uneinigOhneVorschlag: number;
  kernHinweise: number;
  uploads: number;
  digestNotiz?: string;
  kostenUsd?: number;
  verworfen: string[];
}

export function digestCandidates(svc: Services): Upload[] {
  return listUploads(svc.vault)
    .filter((u) => u.ebene === "brand" && u.status === "analysiert" && !u.digest)
    .sort((a, b) => a.datum.localeCompare(b.datum));
}

export async function runDigest(svc: Services): Promise<DigestErgebnis> {
  const v = svc.vault;
  const uploads = digestCandidates(svc);
  const week = isoWeek(svc.now());
  if (!uploads.length) {
    svc.log.info("Digest: keine neuen Brand-Uploads");
    return { vorschlaege: [], details: [], uneinigOhneVorschlag: 0, kernHinweise: 0, uploads: 0, verworfen: [] };
  }
  const guide = readGuide(v);
  const rules = lockRules(v);
  const g = parseGuide(guide);
  const ids = new Set(uploads.map((u) => u.id));
  const byId = new Map(uploads.map((u) => [u.id, u]));
  const personenGesamt = new Set(uploads.map((u) => u.absender)).size;

  const uploadText = uploads
    .map(
      (u) =>
        `<upload id="${u.id}" absender="${u.absender}" datum="${u.datum}">\nBegründung: ${u.begruendung || "(keine)"}\nTranskript: ${u.transkript.join(" ") || "(keines)"}\nKorrekturen: ${u.korrekturen.map((k) => k.text).join(" / ") || "(keine)"}\nAnalyse:\n${u.analyse ? renderAnalyse(u.analyse) : "(keine)"}\n</upload>`,
    )
    .join("\n\n");

  const { data, usage } = await svc.llm.structured({
    purpose: "digest",
    model: svc.cfg.modelle.digest,
    system: digestSystem(svc.cfg.marke.name),
    content: [
      { type: "text", text: `<brand_guide>\n${guide}\n</brand_guide>\n\n<abschnitte>\n${sectionIndex(v, guide)}\n</abschnitte>` },
      { type: "text", text: `Neue Brand-Uploads (${uploads.length}, von ${personenGesamt} ${personenGesamt === 1 ? "Person" : "Personen"}):\n\n${uploadText}` },
    ],
    schema: DigestSchema,
    effort: "high",
  });

  const created: string[] = [];
  const details: DigestErgebnis["details"] = [];
  const verworfen: string[] = [];
  const kern: DigestAntwort["kern_hinweise"] = [...data.kern_hinweise];
  const datum = localDate(svc.now());

  data.vorschlaege.forEach((vs, i) => {
    const belege = vs.belege.filter((b) => ids.has(b));
    const s = findSection(g, vs.abschnitt);
    if (!s) {
      verworfen.push(`„${vs.titel}“: Abschnitt „${vs.abschnitt}“ nicht eindeutig gefunden`);
      return;
    }
    if (isLocked(s, rules, g) || !isEditable(s, rules, g)) {
      // Nie als übernehmbarer Vorschlag: nur als Hinweis für Menschen notieren
      const grund = isLocked(s, rules, g) ? "" : " (außerhalb des Lernbereichs)";
      kern.push({ abschnitt: sectionRef(s) + grund, hinweis: `${vs.titel}: ${vs.begruendung}`, belege });
      return;
    }
    if (!belege.length) {
      verworfen.push(`„${vs.titel}“: ohne gültigen Beleg`);
      return;
    }
    if (/^#{1,6}\s/m.test(vs.neuer_text)) {
      verworfen.push(`„${vs.titel}“: neuer Text enthält Überschriften`);
      return;
    }
    const alt = ownBody(g, s);
    const neu = vs.art === "ersetzen" ? vs.neuer_text : `${alt.trim()}\n\n${vs.neuer_text.trim()}`;
    const path = `${v.dirs.vorschlaege}/${datum} ${String(i + 1).padStart(2, "0")} ${slug(vs.titel, 70)}.md`;
    const belegUploads = uploads.filter((u) => belege.includes(u.id));
    const st = stuetzeVon(belegUploads);
    const uneinig = (vs.uneinig ?? []).map((x) => validateUneinig(x, byId)).filter((x): x is UneinigPunkt => !!x);
    const ungueltig = (vs.uneinig ?? []).length - uneinig.length;
    if (ungueltig > 0) verworfen.push(`„${vs.titel}“: ${ungueltig} Widerspruch/Widersprüche ohne Belege beider Seiten verschiedener Personen verworfen`);
    const props = {
      typ: "vorschlag",
      marke: svc.cfg.marke.name,
      titel: vs.titel,
      abschnitt: sectionRef(s),
      art: vs.art,
      status: "offen",
      freigegeben_von: "",
      erstellt: datum,
      digest: week,
      belege: belegUploads.map((u) => wikilink(uploadNotePath(v, u.id).replace(/\.md$/, ""))),
      bild: belegUploads[0] ? wikilink(belegUploads[0].bild) : undefined,
      alt_hash: hash(alt),
      // Stütze: für Bases sortierbar
      stuetze_personen: st.personen.length,
      stuetze_belege: st.belege,
      stuetze_namen: st.personen,
      einzelstimme: st.einzelstimme,
      uneinig: uneinig.length,
      uneinig_geklaert: uneinig.length ? false : undefined,
      tags: ["brand-system/vorschlag", ...(st.einzelstimme ? ["brand-system/einzelstimme"] : []), ...(uneinig.length ? ["brand-system/uneinig"] : [])],
    };
    const freigabe = svc.cfg.freigebende.length
      ? `Zum Freigeben \`status\` auf \`freigegeben\` und \`freigegeben_von\` auf deinen Namen setzen (${svc.cfg.freigebende.join(" oder ")}). Ablehnen: \`status: abgelehnt\`.`
      : "Zum Freigeben `status` auf `freigegeben` setzen. Ablehnen: `status: abgelehnt`.";
    const body = `# ${vs.titel}

> [!question] Freigabe
> ${freigabe} Der Text zwischen den Markierungen unten darf vorher angepasst werden. Übernommen wird automatisch beim nächsten Lauf (alle 10 Minuten).

**Abschnitt:** ${sectionRef(s)} · **Art:** ${vs.art === "ersetzen" ? "ersetzen" : "ergänzen"} · **Guide:** [[${v.guidePath.replace(/\.md$/, "")}]]

**Stütze:** ${stuetzeText(st)} (${st.personen.join(", ")})
${st.einzelstimme ? `\n> [!note] Einzelstimme\n> Nur ${st.personen[0]} stützt diesen Vorschlag. Er bleibt stehen, sollte aber bewusst entschieden werden.\n` : ""}${
      uneinig.length
        ? `
> [!warning] Uneinig
> Hier widersprechen sich Personen. Die Übernahme ist gesperrt, bis jemand den Punkt geklärt hat: Text unten anpassen, dann \`uneinig_geklaert: true\` setzen und freigeben.

## Uneinig

${uneinig.map((x) => `### ${x.punkt}\n\n- **Dafür:** ${seite(v, x.pro)}\n- **Dagegen:** ${seite(v, x.contra)}\n\n${[...x.pro, ...x.contra].map((u) => `![[${u.bild}|160]]`).join(" ")}`).join("\n\n")}
`
        : ""
    }
## Begründung

${vs.begruendung}

## Änderung

\`\`\`diff
${renderDiff(alt, neu)}
\`\`\`

## Neuer Text

${NEUER_TEXT_START}
${vs.neuer_text.trim()}
${NEUER_TEXT_END}

## Belege

${belegUploads
  .map((u) => `![[${u.bild}|240]]\n[[${uploadNotePath(v, u.id).replace(/\.md$/, "")}|${u.id}]] von ${u.absender}: ${u.analyse?.kurzbeschreibung ?? ""}`)
  .join("\n\n")}
`;
    v.writeText(path, stringifyMd({ props, body }));
    created.push(path);
    details.push({ path, titel: vs.titel, personen: st.personen.length, belege: st.belege, einzelstimme: st.einzelstimme, uneinig: uneinig.length });
  });

  const uneinigOhne = (data.uneinig_ohne_vorschlag ?? []).map((x) => validateUneinig(x, byId)).filter((x): x is UneinigPunkt => !!x);
  const digestPath = `${v.dirs.vorschlaege}/${datum} Wochen-Digest ${week}.md`;
  const digestBody = `# Wochen-Digest ${week}

${data.zusammenfassung}

## Vorschläge

${details.length ? details.map((d) => `- [[${d.path.replace(/\.md$/, "")}]]: ${stuetzeText(d)}${d.einzelstimme ? " · Einzelstimme" : ""}${d.uneinig ? ` · uneinig (${d.uneinig})` : ""}`).join("\n") : "- (keine)"}

## Uneinig ohne Vorschlag

Hier widersprechen sich Personen, ohne dass daraus ein Vorschlag wurde. Nichts davon wird Regel, bis jemand entscheidet.

${uneinigOhne.length ? uneinigOhne.map((x) => `- **${x.punkt}:** dafür ${seite(v, x.pro)}; dagegen ${seite(v, x.contra)}`).join("\n") : "- (keine)"}

## Kern-Hinweise (gesperrt, nur manuell)

Diese Beobachtungen betreffen gesperrte Kern-Abschnitte. Das System ändert sie nie; ein Mensch entscheidet.

${kern.length ? kern.map((k) => `- **${k.abschnitt}:** ${k.hinweis}${k.belege.length ? ` (Belege: ${k.belege.join(", ")})` : ""}`).join("\n") : "- (keine)"}

## Gelesene Uploads

${uploads.map((u) => `- [[${uploadNotePath(v, u.id).replace(/\.md$/, "")}|${u.id}]] von ${u.absender}`).join("\n")}
${verworfen.length ? `\n## Verworfen (automatisch)\n\n${verworfen.map((x) => `- ${x}`).join("\n")}\n` : ""}`;
  v.writeText(
    digestPath,
    stringifyMd({
      props: { typ: "digest", marke: svc.cfg.marke.name, woche: week, erstellt: datum, vorschlaege: created.length, personen: personenGesamt, uneinig_ohne_vorschlag: uneinigOhne.length, kern_hinweise: kern.length, tags: ["brand-system/digest"] },
      body: digestBody,
    }),
  );

  // Uploads als verarbeitet markieren
  for (const u of uploads) {
    u.digest = digestPath;
    u.status = "im-digest";
    writeUpload(v, u);
  }
  svc.log.info("Digest geschrieben", { woche: week, vorschlaege: created.length, kern: kern.length, eingabe: usage.inputTokens, ausgabe: usage.outputTokens, kostenUsd: kostenUsd(usage) });
  return { vorschlaege: created, details, uneinigOhneVorschlag: uneinigOhne.length, kernHinweise: kern.length, uploads: uploads.length, digestNotiz: digestPath, kostenUsd: kostenUsd(usage), verworfen };
}

export function digestTelegramText(svc: Services, r: DigestErgebnis): string {
  if (!r.uploads) return "🗓 Wochen-Digest: keine neuen Brand-Uploads diese Woche.";
  const lines = [
    `🗓 Wochen-Digest: ${r.uploads} neue Brand-Uploads, ${r.vorschlaege.length} Vorschläge${r.kernHinweise ? `, ${r.kernHinweise} Kern-Hinweise` : ""}.`,
    ...r.details.map((d) => `• ${d.titel} (${stuetzeText(d)}${d.einzelstimme ? ", Einzelstimme" : ""}${d.uneinig ? `, ⚠️ uneinig` : ""})`),
    ...(r.uneinigOhneVorschlag ? [`⚠️ ${r.uneinigOhneVorschlag} weitere Punkte, bei denen ihr euch uneinig seid (im Digest).`] : []),
    `Freigabe in Obsidian: Ordner „${svc.vault.dirs.vorschlaege}“, Property status: freigegeben.`,
  ];
  if (svc.cfg.web.url) lines.push(`Ansehen: ${svc.cfg.web.url.replace(/\/$/, "")}/vorschlaege`);
  return lines.join("\n");
}
