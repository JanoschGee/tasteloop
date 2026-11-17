/**
 * Kampagnen-Briefing aus einem Upload der Ebene „Kampagne“.
 * Die Grundregel steht fest im Code und hängt nicht vom Modell ab.
 */
import { readGuide, sectionText } from "../guide/context";
import { findSection, ownBody, parseGuide, parseTable, stripMd } from "../guide/sections";
import { kostenUsd } from "../llm/client";
import { BriefingSchema, briefingSystem, analyseUserText } from "../llm/prompts";
import { parseMd, stringifyMd } from "../frontmatter";
import type { Services } from "../services";
import { localDate, slug, wikilink } from "../util";
import { renderAnalyse, uploadNotePath, type Upload } from "../vault/uploads";
import { imageContent } from "./analyse";
import type { z } from "zod";

export type Briefing = z.infer<typeof BriefingSchema>;

export function grundregel(markenName: string): string {
  return `> [!important] Grundregel
> **Stil der Referenz, Identität von ${markenName}.** Fremde Motive, Claims, Figuren und Layouts werden nie 1:1 übernommen. Das Referenzbild ist eine Stil-Referenz und keine Kompositionsvorlage für ein Bildmodell.`;
}

export function briefingPath(svc: Services, u: Upload): string {
  return `${svc.vault.dirs.briefings}/${u.id} Briefing.md`;
}

export interface Baustein {
  name: string;
  bedeutung: string;
  prompt: string;
}

/** Liest die Baustein-Tabelle (erste Spalte Name, letzte Spalte Prompt-Text) und den Text unter der Tabelle. */
export function readBausteine(guide: string, ref: string | undefined): { bausteine: Baustein[]; hinweise: string } {
  if (!ref) return { bausteine: [], hinweise: "" };
  const g = parseGuide(guide);
  const s = findSection(g, ref);
  if (!s) return { bausteine: [], hinweise: "" };
  const body = ownBody(g, s);
  const t = parseTable(body);
  const bausteine = (t?.rows ?? [])
    .filter((r) => r.length >= 2)
    .map((r) => ({ name: stripMd(r[0]), bedeutung: r.length > 2 ? stripMd(r[1]) : "", prompt: stripMd(r[r.length - 1]) }));
  const hinweise = body
    .split("\n")
    .filter((l) => !l.trim().startsWith("|"))
    .join("\n")
    .trim();
  return { bausteine, hinweise };
}

export function renderBriefing(svc: Services, u: Upload, b: Briefing, guide = ""): string {
  const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join("\n") : "- (keine)");
  const props = {
    typ: "briefing",
    marke: svc.cfg.marke.name,
    titel: b.titel,
    quelle: wikilink(uploadNotePath(svc.vault, u.id).replace(/\.md$/, "")),
    referenzbild: wikilink(u.bild),
    absender: u.absender,
    erstellt: localDate(svc.now()),
    status: "offen",
    tags: ["brand-system/briefing"],
  };
  const body = `# ${slug(b.titel, 120) || "Briefing"}

${grundregel(svc.cfg.marke.name)}

## Referenz

![[${u.bild}]]

Von ${u.absender}, Upload [[${uploadNotePath(svc.vault, u.id).replace(/\.md$/, "")}|${u.id}]].
${u.begruendung ? `\n> ${u.begruendung.split("\n").join("\n> ")}\n` : ""}${u.transkript.length ? `\n**Transkript:** ${u.transkript.join(" ")}\n` : ""}
## Ziel

${b.ziel}

## Stil der Referenz (übernehmen, abstrahiert)

${list(b.stil_der_referenz)}

## Nicht übernehmen

${list(b.nicht_uebernehmen)}

## Grenzen aus dem Brand Guide

${b.grenzen_aus_brand_guide.length ? b.grenzen_aus_brand_guide.map((g) => `- **${g.abschnitt}:** ${g.regel}`).join("\n") : "- (keine genannt, Guide vollständig beachten)"}

Quelle: [[${svc.vault.guidePath.replace(/\.md$/, "")}]]

## Motiv-Ideen in eigener Identität

${list(b.motiv_ideen)}

## Text-Ideen

${list(b.text_ideen)}
${bausteinBlock(svc, b, guide)}${anhangBlock(svc, guide)}

## Offene Fragen

${list(b.offene_fragen)}

## Bildanalyse (Anhang)

${u.analyse ? renderAnalyse(u.analyse).replace(/^### /gm, "#### ") : "_(keine)_"}
`;
  return stringifyMd({ props, body });
}

function bausteinBlock(svc: Services, b: Briefing, guide: string): string {
  const ref = svc.cfg.brand_guide.briefing_bausteine;
  const { bausteine, hinweise } = readBausteine(guide, ref);
  if (!bausteine.length) return "";
  const wanted = new Set((b.prompt_bausteine ?? []).map((n) => n.toLowerCase()));
  const chosen = bausteine.filter((x) => wanted.has(x.name.toLowerCase()));
  const use = chosen.length ? chosen : bausteine;
  const rows = use.map((x) => `| ${x.name} | ${x.bedeutung.replace(/\|/g, "\\|")} | \`${x.prompt.replace(/\|/g, "\\|")}\` |`).join("\n");
  return `
## Prompt-Bausteine aus dem Guide

${chosen.length ? "Passend zu dieser Referenz ausgewählt" : "Alle Bausteine (keine Auswahl getroffen)"}, wörtlich aus „${ref}“. Motiv und Ort ergänzt der Creative-Agent selbst.

| Teil | Was gemeint ist | Prompt-Baustein |
|---|---|---|
${rows}
${hinweise ? `\n${hinweise}\n` : ""}`;
}

function anhangBlock(svc: Services, guide: string): string {
  const parts = svc.cfg.brand_guide.briefing_anhaenge
    .map((ref) => sectionText(svc.vault, guide, ref))
    .filter((x): x is string => !!x)
    // Überschriften eine Ebene tiefer, damit sie unter „Aus dem Guide“ hängen
    .map((t) => t.replace(/^(#{1,5}) /gm, "$1## "));
  if (!parts.length) return "";
  return `
## Aus dem Guide (wörtlich, für Produktion und Prüfung)

${parts.join("\n\n")}
`;
}

export async function createBriefing(svc: Services, u: Upload): Promise<{ path: string; kostenUsd?: number }> {
  const path = briefingPath(svc, u);
  if (svc.vault.exists(path)) {
    const status = parseMd(svc.vault.readText(path)).props.status;
    if (status && status !== "offen") {
      // Briefing ist schon in Arbeit: nicht überschreiben
      svc.log.info("Briefing nicht neu erzeugt, Status ist nicht mehr offen", { id: u.id, status });
      return { path };
    }
  }
  const guide = readGuide(svc.vault);
  const { data, usage } = await svc.llm.structured({
    purpose: "briefing",
    model: svc.cfg.modelle.briefing,
    system: briefingSystem(svc.cfg.marke.name, guide),
    content: [
      imageContent(svc, u.bild),
      {
        type: "text",
        text:
          analyseUserText({
            absender: u.absender,
            begruendung: u.begruendung,
            transkript: u.transkript,
            korrekturen: u.korrekturen.map((k) => k.text),
            ebene: "Kampagne",
          }) + (u.analyse ? `\n\nBildanalyse:\n${renderAnalyse(u.analyse)}` : ""),
      },
    ],
    schema: BriefingSchema,
    effort: "medium",
  });
  svc.vault.writeText(path, renderBriefing(svc, u, data, guide));
  svc.log.info("Briefing geschrieben", { id: u.id, path, eingabe: usage.inputTokens, ausgabe: usage.outputTokens, kostenUsd: kostenUsd(usage) });
  return { path, kostenUsd: kostenUsd(usage) };
}
