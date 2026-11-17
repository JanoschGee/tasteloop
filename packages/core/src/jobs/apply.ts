/**
 * Übernahme freigegebener Vorschläge in den Brand Guide.
 *
 * Sicherheitsnetz (in dieser Reihenfolge):
 *  1. nur status: freigegeben (und freigegeben_von aus der Liste, falls konfiguriert)
 *  2. Zielabschnitt ist nicht gesperrt und liegt im Lernbereich (sonst status: gesperrt)
 *  3. bei „ersetzen“: Abschnitt seit dem Vorschlag unverändert (sonst status: konflikt)
 *  4. applyChange() prüft hart: außer dem Zielabschnitt ändert sich kein Zeichen
 *  5. Protokollzeile im Guide und Version +1; danach Gesamtprüfung gegen die frisch gelesene Datei
 *     (erlaubt sind nur Zielabschnitt, Protokoll-Abschnitt und die freien Frontmatter-Felder)
 *  6. Sicherung der alten Fassung außerhalb des Vaults, Eintrag im Änderungslog der Inbox
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseMd, stringifyMd } from "../frontmatter";
import { lockRules, readGuide } from "../guide/context";
import { appendProtocolRow, applyChange, assertGuideIntegrity, bumpFrontmatter, ChangeError, findSection, hash, isEditable, isLocked, LockedSectionError, ownBody, parseGuide, sectionRef } from "../guide/sections";
import type { Services } from "../services";
import { localDate, localIso } from "../util";
import { NEUER_TEXT_END, NEUER_TEXT_START } from "./digest";

export type ApplyStatus = "übernommen" | "gesperrt" | "konflikt" | "fehler" | "nicht-berechtigt" | "uneinig";

export interface ApplyErgebnis {
  path: string;
  titel: string;
  status: ApplyStatus;
  meldung: string;
}

export function extractNewText(body: string): string | undefined {
  const a = body.indexOf(NEUER_TEXT_START);
  const b = body.indexOf(NEUER_TEXT_END);
  if (a < 0 || b < 0 || b < a) return undefined;
  return body.slice(a + NEUER_TEXT_START.length, b).trim();
}

function setStatus(svc: Services, path: string, status: string, meldung: string, extra: Record<string, unknown> = {}) {
  const doc = parseMd(svc.vault.readText(path));
  doc.props.status = status;
  Object.assign(doc.props, extra);
  const note = `\n> [!${status === "übernommen" ? "success" : "warning"}] ${status} (${localIso(svc.now()).replace("T", " ").slice(0, 16)})\n> ${meldung}\n`;
  doc.body = doc.body.replace(/\n## Protokoll\n[\s\S]*$/, "") + `\n## Protokoll\n${note}`;
  svc.vault.writeText(path, stringifyMd(doc));
}

export function runApply(svc: Services, opts: { backupDir?: string } = {}): ApplyErgebnis[] {
  const v = svc.vault;
  const rules = lockRules(v);
  const results: ApplyErgebnis[] = [];
  const freigebende = svc.cfg.freigebende.map((x) => x.trim().toLowerCase());

  for (const path of v.listMd(v.dirs.vorschlaege)) {
    const doc = parseMd(v.readText(path));
    if (doc.props.typ !== "vorschlag" || doc.props.status !== "freigegeben") continue;
    const titel = String(doc.props.titel ?? path);
    const done = (status: ApplyStatus, meldung: string, extra: Record<string, unknown> = {}) => {
      setStatus(svc, path, status, meldung, extra);
      results.push({ path, titel, status, meldung });
      svc.log.info(`Vorschlag ${status}`, { path, meldung });
    };

    const von = String(doc.props.freigegeben_von ?? "").trim();
    if (freigebende.length && !freigebende.includes(von.toLowerCase())) {
      // Status bleibt "freigegeben", damit nach Ergänzen des Namens der nächste Lauf greift
      results.push({ path, titel, status: "nicht-berechtigt", meldung: `freigegeben_von „${von}“ ist nicht in der Liste der Freigebenden` });
      continue;
    }

    // Uneinige Punkte werden nie stillschweigend Regel: erst klären, dann uneinig_geklaert: true
    if (Number(doc.props.uneinig ?? 0) > 0 && doc.props.uneinig_geklaert !== true) {
      // Status bleibt "freigegeben"; sobald geklärt, greift der nächste Lauf
      results.push({ path, titel, status: "uneinig", meldung: "Personen sind sich hier uneinig. Bitte klären und uneinig_geklaert: true setzen." });
      continue;
    }

    const abschnitt = String(doc.props.abschnitt ?? "");
    const art = doc.props.art === "ersetzen" ? "ersetzen" : "ergaenzen";
    const text = extractNewText(doc.body);
    if (!text) {
      done("fehler", "Kein neuer Text zwischen den Markierungen gefunden.");
      continue;
    }

    let guide: string;
    try {
      guide = readGuide(v);
    } catch (err) {
      done("fehler", String(err instanceof Error ? err.message : err));
      continue;
    }
    const g = parseGuide(guide);
    const s = findSection(g, abschnitt);
    if (!s) {
      done("fehler", `Abschnitt „${abschnitt}“ im Guide nicht (eindeutig) gefunden.`);
      continue;
    }
    if (isLocked(s, rules, g)) {
      done("gesperrt", `„${abschnitt}“ ist ein gesperrter Kern-Abschnitt und wird nie automatisch geändert. Bitte von Hand entscheiden.`);
      continue;
    }
    if (!isEditable(s, rules, g)) {
      done("gesperrt", `„${abschnitt}“ liegt außerhalb des Lernbereichs und wird nicht automatisch geändert.`);
      continue;
    }
    if (art === "ersetzen" && doc.props.alt_hash && hash(ownBody(g, s)) !== doc.props.alt_hash) {
      done("konflikt", "Der Abschnitt wurde seit dem Vorschlag geändert. Bitte Vorschlag prüfen und neu freigeben (alt_hash entfernen, um trotzdem zu übernehmen).");
      continue;
    }

    let neu: string;
    try {
      neu = applyChange(guide, { abschnitt, art, text }, rules);
      const erlaubt = [sectionRef(s)];
      const protokoll = svc.cfg.brand_guide.protokoll_abschnitt;
      if (protokoll) {
        const vorschlag = path.replace(/\.md$/, "");
        neu = appendProtocolRow(neu, protokoll, {
          datum: localDate(svc.now()),
          teil: sectionRef(s).split(" > ").pop()!,
          aenderung: `${titel} (${art === "ersetzen" ? "ersetzt" : "ergänzt"})`,
          beleg: `[[${vorschlag}|Vorschlag]]`,
          freigabe: von || "–",
        });
        const ps = findSection(parseGuide(neu), protokoll);
        if (ps) erlaubt.push(sectionRef(ps));
      }
      neu = bumpFrontmatter(neu, svc.cfg.brand_guide.version_feld, svc.cfg.brand_guide.datum_feld, localDate(svc.now()));
      // zweite, unabhängige Gesamtprüfung direkt vor dem Schreiben gegen die aktuelle Datei
      assertGuideIntegrity(readGuide(v), neu, rules, erlaubt);
    } catch (err) {
      if (err instanceof LockedSectionError) done("gesperrt", err.message);
      else if (err instanceof ChangeError) done("fehler", err.message);
      else done("fehler", String(err instanceof Error ? err.message : err));
      continue;
    }

    if (opts.backupDir) {
      mkdirSync(opts.backupDir, { recursive: true });
      copyFileSync(v.abs(v.guidePath), join(opts.backupDir, `${localIso(svc.now()).replace(/[:T]/g, "-")} ${v.guidePath.split("/").pop()}`));
    }
    v.writeText(v.guidePath, neu);
    appendChangelog(svc, { titel, abschnitt, art, path, von });
    done("übernommen", `In „${abschnitt}“ übernommen (${art === "ersetzen" ? "ersetzt" : "ergänzt"}).`, { uebernommen_am: localIso(svc.now()) });
  }
  return results;
}

function appendChangelog(svc: Services, e: { titel: string; abschnitt: string; art: string; path: string; von: string }) {
  const v = svc.vault;
  const p = v.dirs.aenderungslog;
  const existing = v.exists(p) ? v.readText(p) : `---\ntyp: aenderungslog\n---\n\n# Änderungslog Brand Guide\n`;
  const entry = `- ${localIso(svc.now()).replace("T", " ").slice(0, 16)}: **${e.titel}** in „${e.abschnitt}“ (${e.art}${e.von ? `, freigegeben von ${e.von}` : ""}) → [[${e.path.replace(/\.md$/, "")}]]`;
  const MARK = "<!-- einträge -->";
  const base = existing.includes(MARK) ? existing : `${existing.trimEnd()}\n\n${MARK}\n`;
  const out = base.replace(MARK, `${MARK}\n${entry}`);
  v.writeText(p, out.replace(/\n{3,}/g, "\n\n"));
}

export function applyTelegramText(results: ApplyErgebnis[]): string | undefined {
  const relevant = results.filter((r) => r.status !== "nicht-berechtigt" && r.status !== "uneinig");
  if (!relevant.length) return undefined;
  const icon: Record<ApplyStatus, string> = { übernommen: "✅", gesperrt: "🔒", konflikt: "⚠️", fehler: "❌", "nicht-berechtigt": "⛔", uneinig: "⚖️" };
  return ["Brand Guide:", ...relevant.map((r) => `${icon[r.status]} ${r.titel}: ${r.meldung}`)].join("\n");
}
