/**
 * Vault access. Every write goes through here:
 * - only inside Tasteloop's folder (plus the guide file, see jobs/apply.ts) and Obsidian's .trash
 * - atomic (temp file + rename), so Obsidian Sync never sees half-written files
 * - with a secret check: text containing a secret pattern is never written
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
  /** Tasteloop's folder, vault-relative (with "/") */
  readonly brandDir: string;

  constructor(readonly cfg: BrandConfig) {
    this.root = resolve(cfg.vault.root);
    this.brandDir = cfg.vault.folder.replace(/\\/g, "/").replace(/\/+$/, "");
  }

  /** vault-relative path inside Tasteloop's folder */
  rel(...parts: string[]): string {
    return [this.brandDir, ...parts].filter(Boolean).join("/");
  }

  get dirs() {
    const u = this.cfg.vault.subfolders;
    return {
      uploads: this.rel(u.uploads),
      images: this.rel(u.images),
      proposals: this.rel(u.proposals),
      briefs: this.rel(u.briefs),
      gallery: this.rel(u.gallery),
      proposalsView: this.rel(u.proposals_view),
      moodboard: this.rel(u.moodboard),
      changelog: this.rel(u.changelog),
    };
  }

  get guidePath(): string {
    return this.cfg.guide.file.replace(/\\/g, "/");
  }

  /** absolute path, guarded against escaping the vault */
  abs(relPath: string): string {
    const p = resolve(this.root, relPath);
    if (p !== this.root && !p.startsWith(this.root + sep)) {
      throw new VaultPathError(`Path outside the vault: ${relPath}`);
    }
    return p;
  }

  private assertWritable(relPath: string) {
    const p = this.abs(relPath);
    const brand = this.abs(this.brandDir);
    const guide = this.abs(this.guidePath);
    const trash = this.abs(".trash");
    const ok = p === guide || p.startsWith(brand + sep) || p.startsWith(trash + sep);
    if (!ok) throw new VaultPathError(`Refusing to write outside Tasteloop's folder: ${relPath}`);
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

  /** Markdown files of a folder (not recursive), vault-relative */
  listMd(relDir: string): string[] {
    const abs = this.abs(relDir);
    if (!existsSync(abs)) return [];
    return readdirSync(abs)
      .filter((f) => f.endsWith(".md") && !f.startsWith("."))
      .map((f) => `${relDir}/${f}`)
      .sort();
  }

  /** Moves a file into Obsidian's trash (.trash in the vault). Recoverable until the trash is emptied. */
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
