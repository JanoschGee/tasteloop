/**
 * Laufzeit-Zustand des Bots (Telegram-Offset, Zuordnung Nachricht -> Upload).
 * Liegt außerhalb von Repo und Vault (TASTELOOP_DATA_DIR, Standard ~/.local/state/tasteloop/<marke>).
 * Geht er verloren, funktionieren nur Antworten auf alte Nachrichten nicht mehr;
 * die Notizen im Vault sind die eigentliche Quelle.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface UploadRef {
  chatId: number;
  photoMessageId: number;
  botMessageId?: number;
  senderId: number;
  createdAt: number;
}

export interface BotStateData {
  offset: number;
  /** "<chatId>:<messageId>" -> Upload-ID (Foto, Bot-Bestätigung, Sprachnachricht) */
  messages: Record<string, string>;
  uploads: Record<string, UploadRef>;
  /** verarbeitete update_ids der letzten Zeit (Schutz gegen doppelte Verarbeitung) */
  recentUpdates: number[];
}

export function defaultDataDir(brandId: string, env = process.env): string {
  return env.TASTELOOP_DATA_DIR ? join(env.TASTELOOP_DATA_DIR, brandId) : join(homedir(), ".local", "state", "tasteloop", brandId);
}

export class BotState {
  data: BotStateData;

  constructor(private file: string | null) {
    this.data = { offset: 0, messages: {}, uploads: {}, recentUpdates: [] };
    if (file && existsSync(file)) {
      this.data = { ...this.data, ...JSON.parse(readFileSync(file, "utf8")) };
    }
  }

  static inMemory() {
    return new BotState(null);
  }

  save() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    renameSync(tmp, this.file);
  }

  key(chatId: number, messageId: number) {
    return `${chatId}:${messageId}`;
  }

  link(chatId: number, messageId: number, uploadId: string) {
    this.data.messages[this.key(chatId, messageId)] = uploadId;
  }

  lookup(chatId: number, messageId: number): string | undefined {
    return this.data.messages[this.key(chatId, messageId)];
  }

  forget(uploadId: string) {
    for (const [k, v] of Object.entries(this.data.messages)) if (v === uploadId) delete this.data.messages[k];
    delete this.data.uploads[uploadId];
  }

  /** letzter Upload eines Absenders im Chat, jünger als maxAgeMs */
  lastUploadOf(chatId: number, senderId: number, now: number, maxAgeMs: number): string | undefined {
    let best: [string, UploadRef] | undefined;
    for (const e of Object.entries(this.data.uploads)) {
      const r = e[1];
      if (r.chatId !== chatId || r.senderId !== senderId || now - r.createdAt > maxAgeMs) continue;
      if (!best || r.createdAt > best[1].createdAt) best = e;
    }
    return best?.[0];
  }

  markUpdate(id: number): boolean {
    if (this.data.recentUpdates.includes(id)) return false;
    this.data.recentUpdates.push(id);
    if (this.data.recentUpdates.length > 500) this.data.recentUpdates = this.data.recentUpdates.slice(-500);
    return true;
  }
}
