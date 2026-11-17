/** Test-Hilfen: temporärer Vault, Fake-Claude, Fake-Telegram, Fake-Transkription. Keine Netzaufrufe. */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseBrandConfig, type BrandConfig } from "../src/config";
import type { LlmClient, StructuredRequest } from "../src/llm/client";
import { silentLogger } from "../src/log";
import type { Services } from "../src/services";
import type { InlineKeyboard, TelegramApi, TgMessage, TgUpdate } from "../src/telegram/api";
import type { Transcriber } from "../src/transcribe/transcribe";
import { ensureVaultStructure } from "../src/vault/bases";
import { Vault } from "../src/vault/vault";

export const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
export const fixture = (p: string) => readFileSync(join(FIXTURES, p), "utf8");

/** 1x1-JPEG, damit echte Bytes im Vault landen */
export const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);

export function makeVault(overrides: (cfg: BrandConfig) => void = () => {}): { cfg: BrandConfig; vault: Vault; root: string } {
  const root = mkdtempSync(join(tmpdir(), "ab-vault-"));
  mkdirSync(join(root, ".obsidian"));
  mkdirSync(join(root, "Marke"), { recursive: true });
  writeFileSync(join(root, "Marke", "Brand Guide.md"), fixture("guide.md"));
  writeFileSync(join(root, "Fremd.md"), "Diese Datei gehört nicht zum Brand-System.\n");
  const cfg = parseBrandConfig(fixture("brand.yaml").replace("/wird/im/test/ersetzt", root));
  overrides(cfg);
  const vault = new Vault(cfg);
  ensureVaultStructure(vault);
  return { cfg, vault, root };
}

export const ANALYSE_FIXTURE = {
  kurzbeschreibung: "Paar am Küchentisch im warmen Abendlicht, analoge Körnung.",
  gefaellt: ["Warmes Seitenlicht", "Echte Haut, keine Retusche"],
  gefaellt_nicht: ["Logo eines Fremdanbieters im Bild"],
  stilmerkmale: {
    farbe: ["Off-White", "Terrakotta #C8643B"],
    licht: ["Seitenlicht, golden hour"],
    komposition: ["Halbtotale, Augenhöhe"],
    typografie: [],
    material_textur: ["Filmkorn"],
    stimmung: ["vertraut", "verspielt"],
  },
  bezug_zur_marke: "Stützt „Bildwelt“ und „Farbe“.",
  ebene_empfehlung: "brand" as const,
  schlagworte: ["warm", "analog", "filmkorn"],
};

export const BRIEFING_FIXTURE = {
  titel: "Wintergefühl zu zweit",
  ziel: "Neugier auf das Produkt im Dezember wecken.",
  stil_der_referenz: ["Warme, gedeckte Farben", "Viel Weißraum"],
  nicht_uebernehmen: ["Das Paar-Motiv der Referenz", "Den Claim der Referenz", "Das Layout mit Logo unten rechts"],
  grenzen_aus_brand_guide: [{ abschnitt: "3. Look and Feel > Bildwelt", regel: "Echte Menschen, kein Stock." }],
  motiv_ideen: ["Zwei Tassen auf der Fensterbank", "Hände unter einer Decke"],
  prompt_bausteine: [] as string[],
  text_ideen: ["Mehr als Netflix."],
  offene_fragen: ["Budget?"],
};

export class FakeLlm implements LlmClient {
  calls: StructuredRequest<unknown>[] = [];
  responses: Record<string, unknown[]> = { analyse: [], digest: [], briefing: [] };
  failNext: Record<string, Error | undefined> = {};

  queue(purpose: "analyse" | "digest" | "briefing", data: unknown) {
    this.responses[purpose].push(data);
    return this;
  }

  async structured<T>(req: StructuredRequest<T>) {
    this.calls.push(req as StructuredRequest<unknown>);
    const err = this.failNext[req.purpose];
    if (err) {
      this.failNext[req.purpose] = undefined;
      throw err;
    }
    const q = this.responses[req.purpose];
    const fallback = req.purpose === "analyse" ? ANALYSE_FIXTURE : req.purpose === "briefing" ? BRIEFING_FIXTURE : undefined;
    const data = (q.length ? q.shift() : fallback) as T;
    if (data === undefined) throw new Error(`FakeLlm: keine Antwort für ${req.purpose} hinterlegt`);
    // Schema muss die Antwort akzeptieren (prüft, dass Fixtures zum echten Schema passen)
    const parsed = req.schema.parse(data);
    return { data: parsed, usage: { inputTokens: 5000, outputTokens: 800, cacheReadTokens: 0, cacheWriteTokens: 0, model: req.model } };
  }
}

export class FakeTranscriber implements Transcriber {
  calls = 0;
  constructor(public text = "Das Licht ist super, das ist was für die Marke", public fail = false) {}
  async transcribe() {
    this.calls++;
    if (this.fail) throw new Error("kaputt");
    return { text: this.text, engine: "fake" };
  }
}

export interface Sent {
  chatId: number;
  text: string;
  replyTo?: number;
  keyboard?: InlineKeyboard;
  messageId: number;
}

export class FakeTelegram implements TelegramApi {
  sent: Sent[] = [];
  edits: { chatId: number; messageId: number; text: string; keyboard?: InlineKeyboard }[] = [];
  answers: { id: string; text?: string }[] = [];
  updates: TgUpdate[][] = [];
  nextMessageId = 500;
  files: Record<string, Buffer> = {};

  async getUpdates(_offset?: number, _timeoutSec?: number) {
    return this.updates.shift() ?? [];
  }
  async sendMessage(chatId: number, text: string, opts: { replyTo?: number; keyboard?: InlineKeyboard } = {}): Promise<TgMessage> {
    const messageId = this.nextMessageId++;
    this.sent.push({ chatId, text, replyTo: opts.replyTo, keyboard: opts.keyboard, messageId });
    return { message_id: messageId, date: 0, chat: { id: chatId, type: "supergroup" } };
  }
  async editMessageText(chatId: number, messageId: number, text: string, keyboard?: InlineKeyboard) {
    this.edits.push({ chatId, messageId, text, keyboard });
  }
  async answerCallbackQuery(id: string, text?: string) {
    this.answers.push({ id, text });
  }
  async downloadFile(fileId: string) {
    const isVoice = fileId.startsWith("voice");
    return { data: this.files[fileId] ?? (isVoice ? Buffer.from("OggS-fake") : TINY_JPEG), path: isVoice ? `voice/${fileId}.oga` : `photos/${fileId}.jpg` };
  }
  lastEdit() {
    return this.edits[this.edits.length - 1];
  }
}

export function makeServices(opts: { now?: Date; transcriber?: Transcriber; llm?: FakeLlm; overrides?: (c: BrandConfig) => void } = {}) {
  const { cfg, vault, root } = makeVault(opts.overrides);
  const llm = opts.llm ?? new FakeLlm();
  const transcriber = opts.transcriber ?? new FakeTranscriber();
  let now = opts.now ?? new Date(2026, 10, 12, 15, 30, 0);
  const svc: Services = { cfg, vault, llm, transcriber, log: silentLogger, now: () => now };
  return { svc, cfg, vault, root, llm, transcriber, setNow: (d: Date) => (now = d) };
}

export function update(name: string, replace: Record<string, string> = {}): TgUpdate {
  let text = fixture(`telegram/${name}.json`);
  for (const [k, v] of Object.entries(replace)) text = text.split(k).join(v);
  return JSON.parse(text) as TgUpdate;
}
