/**
 * Prompts und Antwort-Schemas für Analyse, Digest und Briefing.
 * Markenneutral: Markenname und Guide kommen zur Laufzeit aus der Config.
 */
import { z } from "zod";

const liste = z.array(z.string());

export const AnalyseSchema = z.object({
  kurzbeschreibung: z.string().describe("1–2 Sätze: was ist zu sehen"),
  gefaellt: liste.describe("Was der Absender gut findet bzw. was am Bild für die Marke taugt. Aus Begründung/Transkript ableiten, sonst begründet vermuten."),
  gefaellt_nicht: liste.describe("Was nicht gefällt oder nicht zur Marke passt"),
  stilmerkmale: z.object({
    farbe: liste,
    licht: liste,
    komposition: liste,
    typografie: liste,
    material_textur: liste,
    stimmung: liste,
  }),
  bezug_zur_marke: z.string().describe("Wie das Bild zum Brand Guide steht: stützt, erweitert oder widerspricht welche Regel"),
  ebene_empfehlung: z.enum(["brand", "kampagne", "merken", "unklar"]),
  schlagworte: liste.describe("3–6 kurze Stil-Schlagworte, kleingeschrieben"),
});

export function analyseSystem(markenName: string, guideAuszug: string): string {
  return `Du bist Brand-Analyst für die Marke „${markenName}“. Ein Teammitglied hat ein Inspirationsbild geschickt, oft mit einer gesprochenen oder geschriebenen Begründung.

Aufgabe: Halte fest, was am Bild gefällt und was nicht, und beschreibe die Stilmerkmale so konkret, dass ein Designer oder ein Bild-Agent sie umsetzen kann (Farben mit Namen oder Hex-Schätzung, Lichtrichtung, Brennweite/Perspektive, Körnung, Typo-Klasse usw.).

Regeln:
- Die Begründung des Menschen hat Vorrang vor deiner eigenen Einschätzung. Wo er etwas sagt, übernimm es sinngemäß; wo er schweigt, ergänze vorsichtig.
- Beschreibe Stil abstrahiert. Fremde Logos, Claims, Figuren und Markennamen nennst du nur zur Einordnung, nie als Vorlage.
- Schreibe auf Deutsch, knapp, in ganzen Sätzen oder kurzen Stichpunkten.
- ebene_empfehlung: "brand" wenn es um Identität geht (Farbe, Bildwelt, Typografie, Ton), "kampagne" wenn es um eine konkrete Anzeige/Aktion geht („so eine Anzeige wollen wir“), "merken" wenn nur Archiv, sonst "unklar".

Auszug aus dem aktuellen Brand Guide (Kontext, nicht ändern):
<brand_guide>
${guideAuszug}
</brand_guide>`;
}

export function analyseUserText(o: { absender: string; begruendung: string; transkript: string[]; korrekturen: string[]; ebene: string }): string {
  return `Absender: ${o.absender}
Gewählte Ebene: ${o.ebene}
Bildunterschrift: ${o.begruendung || "(keine)"}
Transkript der Sprachnachricht(en): ${o.transkript.length ? o.transkript.join(" / ") : "(keine)"}
Korrekturen: ${o.korrekturen.length ? o.korrekturen.join(" / ") : "(keine)"}`;
}

// ---------------------------------------------------------------------------

export const DigestSchema = z.object({
  zusammenfassung: z.string().describe("2–4 Sätze: welches Muster zeigen die neuen Uploads"),
  vorschlaege: z.array(
    z.object({
      titel: z.string().describe("kurz, z. B. „Körnung als Pflicht in der Bildwelt“"),
      abschnitt: z.string().describe("exakter Pfad eines BEARBEITBAREN Abschnitts aus der Liste, z. B. „5. Look and Feel > Farbe“"),
      art: z.enum(["ersetzen", "ergaenzen"]).describe("ergaenzen bevorzugen; ersetzen nur, wenn der bisherige Text widerlegt ist"),
      neuer_text: z.string().describe("Markdown ohne Überschriften. Bei ersetzen: der komplette neue Abschnittstext. Bei ergaenzen: nur der neue Absatz bzw. die neuen Punkte."),
      begruendung: z.string(),
      belege: z.array(z.string()).describe("IDs der Uploads, die den Vorschlag stützen (mindestens eine)"),
      uneinig: z
        .array(
          z.object({
            punkt: z.string().describe("worum es geht, neutral formuliert"),
            pro: z.array(z.string()).describe("IDs der Uploads, die den Punkt loben"),
            contra: z.array(z.string()).describe("IDs der Uploads, die ihn kritisieren"),
          }),
        )
        .describe("Punkte zu diesem Vorschlag, bei denen Personen sich widersprechen. Leer, wenn alle einig sind."),
    }),
  ),
  uneinig_ohne_vorschlag: z
    .array(z.object({ punkt: z.string(), pro: z.array(z.string()), contra: z.array(z.string()) }))
    .describe("Widersprüche zwischen Personen, zu denen du bewusst keinen Vorschlag machst"),
  kern_hinweise: z
    .array(z.object({ abschnitt: z.string(), hinweis: z.string(), belege: z.array(z.string()) }))
    .describe("Beobachtungen, die einen GESPERRTEN Abschnitt betreffen. Werden nur notiert, nie automatisch übernommen."),
});

export function digestSystem(markenName: string): string {
  return `Du pflegst den Brand Guide der Marke „${markenName}“. Einmal pro Woche bekommst du die neuen Brand-Uploads des Teams (Bild-Analysen mit Begründung der Menschen) und den aktuellen Guide.

Aufgabe: Leite höchstens 5 Änderungsvorschläge für den Guide ab. Jeder Vorschlag muss durch mindestens einen Upload belegt sein. Lieber kein Vorschlag als ein schwacher.

Regeln:
- Ändere nur Abschnitte, die in der Abschnittsliste als [bearbeitbar] markiert sind. Abschnitte mit [gesperrt] sind der Kern der Marke. Dazu machst du höchstens einen kern_hinweis.
- Ein einzelnes Bild ist ein Signal, kein Gesetz. Mehrere ähnliche Uploads wiegen stärker. Widerspricht ein Upload dem Guide, schlage eine Präzisierung vor, nicht den Umsturz.
- Bleib im Ton und in der Form des Guides (Sprache, Satzlänge, Listenstil). Keine Überschriften im neuen Text.
- Stil abstrahieren: keine fremden Marken, Claims, Figuren oder Layouts als Regel übernehmen.
- Abschnitt exakt so angeben, wie er in der Liste steht.
- Mehrere Personen tragen bei. Gewicht hat, was mehrere verschiedene Personen unabhängig stützen, nicht die Zahl der Bilder einer einzelnen Person. Vorschläge, die nur eine Person stützt, sind erlaubt; das System markiert sie als Einzelstimme.
- Widersprüche nie stillschweigend auflösen: Lobt eine Person etwas, das eine andere kritisiert, trage es unter „uneinig“ ein (beim betroffenen Vorschlag oder unter uneinig_ohne_vorschlag), mit den Upload-IDs beider Seiten. Der neue Text darf einen umstrittenen Punkt nicht als Regel festschreiben.
- Tabellen (z. B. Tokens oder Prompt-Bausteine) bei „ersetzen“ vollständig im gleichen Format wiedergeben und nur die betroffenen Zeilen ändern. Prompt-Bausteine bleiben in der Sprache, in der sie stehen.
- Abschnitte mit [nicht lernbar] ändert das System nicht; dazu höchstens ein kern_hinweis.`;
}

// ---------------------------------------------------------------------------

export const BriefingSchema = z.object({
  titel: z.string().describe("Arbeitstitel der Kampagnenidee, kurz"),
  ziel: z.string().describe("Was die Kampagne erreichen soll, abgeleitet aus Begründung und Bild"),
  stil_der_referenz: z.array(z.string()).describe("abstrahierte Stilmerkmale, die übernommen werden sollen"),
  nicht_uebernehmen: z.array(z.string()).describe("konkrete Elemente der Referenz, die NICHT übernommen werden dürfen (Motive, Claims, Figuren, Layout, Logos)"),
  grenzen_aus_brand_guide: z.array(z.object({ abschnitt: z.string(), regel: z.string() })).describe("Regeln aus dem Guide, die für diese Kampagne gelten"),
  motiv_ideen: z.array(z.string()).describe("2–4 eigene Motiv-Ideen in der Identität der Marke"),
  prompt_bausteine: z
    .array(z.string())
    .describe("Namen (erste Spalte) der passenden Prompt-Bausteine aus der Baustein-Tabelle des Guides, falls es eine gibt; sonst leer"),
  text_ideen: z.array(z.string()).describe("0–3 Headline- oder Text-Ideen im Ton des Guides"),
  offene_fragen: z.array(z.string()),
});

export function briefingSystem(markenName: string, guide: string): string {
  return `Du schreibst Kampagnen-Briefings für Creative-Agenten der Marke „${markenName}“. Grundlage ist ein Referenzbild, das ein Teammitglied geschickt hat („so etwas wollen wir“), plus seine Begründung und die Bildanalyse.

Grundregel: Stil der Referenz, Identität von ${markenName}. Fremde Motive, Claims, Figuren und Layouts werden nie 1:1 übernommen. Das Referenzbild ist Stil-Referenz, keine Kompositionsvorlage für ein Bildmodell.

Halte dich an den Brand Guide. Nenne die relevanten Grenzen mit Abschnitt. Gibt es im Guide eine Tabelle mit Prompt-Bausteinen, nenne in prompt_bausteine die Namen (erste Spalte) der Bausteine, die zu dieser Referenz passen; den Text übernimmt das System wörtlich aus dem Guide. Schreibe auf Deutsch, konkret und knapp.

<brand_guide>
${guide}
</brand_guide>`;
}
