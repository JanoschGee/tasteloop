/**
 * Obsidian Bases files (.base, YAML): gallery of uploads as cards, table of proposals.
 * Created only when missing, so changes made in Obsidian are kept.
 */
import { stringify } from "yaml";
import type { Vault } from "./vault";
import { emptyCanvas } from "./canvas";

export function galleryBase(v: Vault): string {
  const doc = {
    filters: { and: [`file.inFolder("${v.dirs.uploads}")`, 'type == "upload"'] },
    properties: {
      "note.level": { displayName: "Level" },
      "note.sender": { displayName: "From" },
      "note.date": { displayName: "Date" },
      "note.status": { displayName: "Status" },
    },
    views: [
      {
        type: "cards",
        name: "Gallery",
        image: "note.image",
        imageFit: "cover",
        order: ["file.name", "level", "sender", "date", "status"],
        sort: [{ property: "note.date", direction: "DESC" }],
      },
      {
        type: "cards",
        name: "Brand",
        image: "note.image",
        filters: { and: ['level == "brand"'] },
        order: ["file.name", "sender", "date", "status"],
        sort: [{ property: "note.date", direction: "DESC" }],
      },
      {
        type: "cards",
        name: "Campaign",
        image: "note.image",
        filters: { and: ['level == "campaign"'] },
        order: ["file.name", "sender", "date", "brief"],
        sort: [{ property: "note.date", direction: "DESC" }],
      },
      {
        type: "table",
        name: "List",
        order: ["file.name", "level", "sender", "date", "status", "style"],
        sort: [{ property: "note.date", direction: "DESC" }],
      },
    ],
  };
  return stringify(doc, { lineWidth: 0 });
}

export function proposalsBase(v: Vault): string {
  const doc = {
    filters: { and: [`file.inFolder("${v.dirs.proposals}")`, 'type == "proposal"'] },
    views: [
      {
        type: "table",
        name: "Open",
        filters: { and: ['status == "open"'] },
        order: ["file.name", "support_people", "support_refs", "single_voice", "disputed", "section", "change", "created", "approved_by"],
        sort: [
          { property: "note.support_people", direction: "DESC" },
          { property: "note.support_refs", direction: "DESC" },
        ],
      },
      {
        type: "table",
        name: "Disputed",
        filters: { and: ["disputed > 0", 'status != "applied"'] },
        order: ["file.name", "disputed", "dispute_resolved", "supporters", "section", "status"],
      },
      {
        type: "table",
        name: "All",
        order: ["file.name", "section", "status", "created", "applied_at"],
        sort: [{ property: "note.created", direction: "DESC" }],
      },
    ],
  };
  return stringify(doc, { lineWidth: 0 });
}

/** Creates missing structure files. Existing ones are left alone. */
export function ensureVaultStructure(v: Vault): string[] {
  const created: string[] = [];
  const put = (p: string, text: string) => {
    if (!v.exists(p)) {
      v.writeText(p, text);
      created.push(p);
    }
  };
  put(v.dirs.gallery, galleryBase(v));
  put(v.dirs.proposalsView, proposalsBase(v));
  put(v.dirs.moodboard, JSON.stringify(emptyCanvas(), null, "\t") + "\n");
  put(
    v.dirs.changelog,
    `---\ntype: changelog\n---\n\n# Brand guide changelog\n\nTasteloop adds every applied change here (newest first).\n\n<!-- entries -->\n`,
  );
  return created;
}
