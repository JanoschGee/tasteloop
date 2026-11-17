/**
 * Selektiver Sync: Auf dem Host soll nur ein Ordner des Vaults liegen (vault.sync_nur).
 * Obsidian Headless kennt nur ausgeschlossene ORDNER (ob sync-config --excluded-folders).
 * planExcludes berechnet diese Liste aus einem lokalen Vault und meldet die Dateien,
 * die trotzdem mitkämen (Dateien in den Elternordnern lassen sich nicht ausschließen).
 * outsideScope prüft auf dem Host, ob etwas außerhalb des erlaubten Ordners liegt.
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface SyncPlan {
  /** Ordner für --excluded-folders (vault-relativ) */
  excluded: string[];
  /** Dateien außerhalb des Zielordners, die trotz Ausschluss synchronisiert würden */
  leaking: string[];
}

const hidden = (n: string) => n.startsWith(".");

export function planExcludes(vaultRoot: string, keepRel: string, erlaubt: string[] = []): SyncPlan {
  const parts = keepRel.split("/").filter(Boolean);
  const excluded: string[] = [];
  const leaking: string[] = [];
  let cur = "";
  for (const part of parts) {
    const dir = join(vaultRoot, cur);
    for (const name of readdirSync(dir).sort()) {
      if (hidden(name)) continue;
      const rel = cur ? `${cur}/${name}` : name;
      const isDir = statSync(join(dir, name)).isDirectory();
      if (isDir && name !== part) excluded.push(rel);
      if (!isDir) leaking.push(rel);
    }
    cur = cur ? `${cur}/${part}` : part;
  }
  const ok = new Set(erlaubt);
  return { excluded, leaking: leaking.filter((f) => !ok.has(f)) };
}

/** Alle Dateien im Vault außerhalb von keepRel (versteckte Ordner wie .obsidian, .trash ausgenommen). */
export function outsideScope(vaultRoot: string, keepRel: string, limit = 1000, erlaubt: string[] = []): string[] {
  const ok = new Set(erlaubt);
  const keep = keepRel.replace(/\/+$/, "");
  const out: string[] = [];
  const walk = (rel: string) => {
    if (out.length >= limit) return;
    if (rel && (rel === keep || rel.startsWith(keep + "/"))) return;
    for (const name of readdirSync(join(vaultRoot, rel))) {
      if (hidden(name)) continue;
      const r = rel ? `${rel}/${name}` : name;
      if (statSync(join(vaultRoot, r)).isDirectory()) {
        if (!(keep === r || keep.startsWith(r + "/") || r.startsWith(keep + "/"))) {
          out.push(`${r}/`);
          continue;
        }
        walk(r);
      } else if (!(r === keep || r.startsWith(keep + "/")) && !ok.has(r)) out.push(r);
    }
  };
  walk("");
  return out;
}

/** Shell-sicherer Befehl für ob sync-config. */
export function excludeCommand(vaultPath: string, excluded: string[]): string {
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
  return `ob sync-config --path ${q(vaultPath)} --excluded-folders ${q(excluded.join(","))} --configs '' --file-types image`;
}
