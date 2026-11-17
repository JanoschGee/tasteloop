/**
 * Zugriff auf den Vault. Alle Schreibzugriffe laufen hier durch:
 * - nur innerhalb des Brand-Ordners (plus die Brand-Guide-Datei, siehe guide/apply.ts)
 * - atomar (temp-Datei + rename), damit Obsidian Sync nie halbe Dateien sieht
 * - mit Secret-Prüfung: Text mit Secret-Muster wird nicht geschrieben
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import type { BrandConfig } from "../config";
import { assertNoSecrets } from "../secrets";
import { localIso } from "../util";

export class VaultPathError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "VaultPathError";
  }
}

export class Vault {
  readonly root: string;
  /** Brand-Ordner, vault-relativ (mit "/") */
  readonly brandDir: string;

  constructor(readonly cfg: BrandConfig) {
    this.root = resolve(cfg.vault.wurzel);
    this.brandDir = cfg.vault.ordner.replace(/\\/g, "/").replace(/\/+$/, "");
  }

  /** Vault-relativer Pfad im Brand-Ordner */
  rel(...parts: string[]): string {
    return [this.brandDir, ...parts].filter(Boolean).join("/");
  }

  get dirs() {
    const u = this.cfg.vault.unterordner;
    return {
      uploads: this.rel(u.uploads),
      bilder: this.rel(u.bilder),
      vorschlaege: this.rel(u.vorschlaege),
      briefings: this.rel(u.briefings),
      galerie: this.rel(u.galerie),
      vorschlaegeAnsicht: this.rel(u.vorschlaege_ansicht),
      moodboard: this.rel(u.moodboard),
      aenderungslog: this.rel(u.aenderungslog),
    };
  }

  get guidePath(): string {
    return this.cfg.brand_guide.datei.replace(/\\/g, "/");
  }

  /** Absoluter Pfad, mit Schutz gegen Ausbruch aus dem Vault */
  abs(relPath: string): string {
    const p = resolve(this.root, relPath);
    if (p !== this.root && !p.startsWith(this.root + sep)) {
      throw new VaultPathError(`Pfad außerhalb des Vaults: ${relPath}`);
    }
    return p;
  }

  private assertWritable(relPath: string) {
    const p = this.abs(relPath);
    const brand = this.abs(this.brandDir);
    const guide = this.abs(this.guidePath);
    const trash = this.abs(".trash");
    const ok = p === guide || p.startsWith(brand + sep) || p.startsWith(trash + sep);
    if (!ok) throw new VaultPathError(`Schreiben außerhalb des Brand-Ordners verweigert: ${relPath}`);
    return p;
  }

  exists(relPath: string): boolean {
    return existsSync(this.abs(relPath));
  }

  readText(relPath: string): string {
    return readFileSync(this.abs(relPath), "utf8");
  }

  readBytes(relPath: string): Buffer {
    return readFileSync(this.abs(relPath));
  }

  writeText(relPath: string, text: string): void {
    assertNoSecrets(relPath, text);
    this.atomicWrite(this.assertWritable(relPath), text);
  }

  writeBytes(relPath: string, data: Buffer): void {
    this.atomicWrite(this.assertWritable(relPath), data);
  }

  private atomicWrite(abs: string, data: string | Buffer) {
    mkdirSync(dirname(abs), { recursive: true });
    const tmp = join(dirname(abs), `.${basename(abs)}.${process.pid}.tmp`);
    writeFileSync(tmp, data);
    renameSync(tmp, abs);
  }

  /** Markdown-Dateien eines Ordners (nicht rekursiv), vault-relativ */
  listMd(relDir: string): string[] {
    const abs = this.abs(relDir);
    if (!existsSync(abs)) return [];
    return readdirSync(abs)
      .filter((f) => f.endsWith(".md") && !f.startsWith("."))
      .map((f) => `${relDir}/${f}`)
      .sort();
  }

  /**
   * Verschiebt eine Datei in den Obsidian-Papierkorb (.trash im Vault).
   * Rückholbar, solange der Papierkorb nicht geleert wird.
   */
  trash(relPath: string): string | undefined {
    const src = this.assertWritable(relPath);
    if (!existsSync(src)) return undefined;
    const stamp = localIso().replace(/[:T]/g, "-");
    const targetRel = `.trash/${stamp} ${basename(relPath)}`;
    const dst = this.assertWritable(targetRel);
    mkdirSync(dirname(dst), { recursive: true });
    renameSync(src, dst);
    return targetRel;
  }

  remove(relPath: string): void {
    rmSync(this.assertWritable(relPath), { force: true });
  }

  mtime(relPath: string): Date | undefined {
    const p = this.abs(relPath);
    return existsSync(p) ? statSync(p).mtime : undefined;
  }

  relFromAbs(abs: string): string {
    return relative(this.root, abs).split(sep).join("/");
  }
}
