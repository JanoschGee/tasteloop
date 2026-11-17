/**
 * Obsidian-Bases-Dateien (.base, YAML): Galerie der Uploads als Karten,
 * Tabelle der offenen Vorschläge. Werden nur angelegt, wenn sie fehlen,
 * damit Anpassungen in Obsidian erhalten bleiben.
 */
import { stringify } from "yaml";
import type { Vault } from "./vault";
import { emptyCanvas } from "./canvas";

export function galerieBase(v: Vault): string {
  const doc = {
    filters: { and: [`file.inFolder("${v.dirs.uploads}")`, 'typ == "upload"'] },
    properties: {
      "note.ebene": { displayName: "Ebene" },
      "note.absender": { displayName: "Von" },
      "note.datum": { displayName: "Datum" },
      "note.status": { displayName: "Status" },
    },
    views: [
      {
        type: "cards",
        name: "Galerie",
        image: "note.bild",
        imageFit: "cover",
        order: ["file.name", "ebene", "absender", "datum", "status"],
        sort: [{ property: "note.datum", direction: "DESC" }],
      },
      {
        type: "cards",
        name: "Brand",
        image: "note.bild",
        filters: { and: ['ebene == "brand"'] },
        order: ["file.name", "absender", "datum", "status"],
        sort: [{ property: "note.datum", direction: "DESC" }],
      },
      {
        type: "cards",
        name: "Kampagne",
        image: "note.bild",
        filters: { and: ['ebene == "kampagne"'] },
        order: ["file.name", "absender", "datum", "briefing"],
        sort: [{ property: "note.datum", direction: "DESC" }],
      },
      {
        type: "table",
        name: "Liste",
        order: ["file.name", "ebene", "absender", "datum", "status", "stil"],
        sort: [{ property: "note.datum", direction: "DESC" }],
      },
    ],
  };
  return stringify(doc, { lineWidth: 0 });
}

export function vorschlaegeBase(v: Vault): string {
  const doc = {
    filters: { and: [`file.inFolder("${v.dirs.vorschlaege}")`] },
    views: [
      {
        type: "table",
        name: "Offen",
        filters: { and: ['status == "offen"'] },
        order: ["file.name", "stuetze_personen", "stuetze_belege", "einzelstimme", "uneinig", "abschnitt", "art", "erstellt", "freigegeben_von"],
        sort: [
          { property: "note.stuetze_personen", direction: "DESC" },
          { property: "note.stuetze_belege", direction: "DESC" },
        ],
      },
      {
        type: "table",
        name: "Uneinig",
        filters: { and: ["uneinig > 0", 'status != "übernommen"'] },
        order: ["file.name", "uneinig", "uneinig_geklaert", "stuetze_namen", "abschnitt", "status"],
      },
      {
        type: "table",
        name: "Alle",
        order: ["file.name", "abschnitt", "status", "erstellt", "uebernommen_am"],
        sort: [{ property: "note.erstellt", direction: "DESC" }],
      },
    ],
  };
  return stringify(doc, { lineWidth: 0 });
}

/** Legt fehlende Strukturdateien an. Bestehende werden nicht verändert. */
export function ensureVaultStructure(v: Vault): string[] {
  const created: string[] = [];
  const put = (p: string, text: string) => {
    if (!v.exists(p)) {
      v.writeText(p, text);
      created.push(p);
    }
  };
  put(v.dirs.galerie, galerieBase(v));
  put(v.dirs.vorschlaegeAnsicht, vorschlaegeBase(v));
  put(v.dirs.moodboard, JSON.stringify(emptyCanvas(), null, "\t") + "\n");
  put(
    v.dirs.aenderungslog,
    `---\ntyp: aenderungslog\n---\n\n# Änderungslog Brand Guide\n\nHier trägt das System jede übernommene Änderung ein (neueste oben).\n\n<!-- einträge -->\n`,
  );
  return created;
}
