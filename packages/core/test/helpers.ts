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
  const root = mkdtempSync(join(tmpdir(), "tl-vault-"));
  mkdirSync(join(root, ".obsidian"));
  mkdirSync(join(root, "Brand"), { recursive: true });
  writeFileSync(join(root, "Brand", "Brand Guide.md"), fixture("guide.md"));
  writeFileSync(join(root, "Private.md"), "This file is not part of Tasteloop.\n");
  const cfg = parseBrandConfig(fixture("brand.yaml").replace("/replaced/in/test", root));
  overrides(cfg);
  const vault = new Vault(cfg);
  ensureVaultStructure(vault);
  return { cfg, vault, root };
}

export const ANALYSIS_FIXTURE = {
  summary: "A couple at the kitchen table in warm evening light, analogue grain.",
  likes: ["Warm side light", "Real skin, no retouching"],
  dislikes: ["Another company's logo in the image"],
  style: {
    color: ["Off-white", "Terracotta #C8643B"],
    light: ["Side light, golden hour"],
    composition: ["Medium shot, eye level"],
    typography: [],
    material: ["Film grain"],
    mood: ["familiar", "playful"],
  },
  brand_fit: "Supports \"Imagery\" and \"Colour\".",
  level_suggestion: "brand" as const,
  keywords: ["warm", "analogue", "grain"],
};

export const BRIEF_FIXTURE = {
  title: "Winter for two",
  goal: "Make people curious about the product in December.",
  style_to_take: ["Warm, muted colours", "Lots of white space"],
  do_not_take: ["The couple motif of the reference", "The reference's claim", "The layout with the logo bottom right"],
  guide_limits: [{ section: "3. Look and Feel > Imagery", rule: "Real people, no stock." }],
  motif_ideas: ["Two cups on the windowsill", "Hands under a blanket"],
  prompt_blocks: [] as string[],
  copy_ideas: ["More than Netflix."],
  open_questions: ["Budget?"],
};

export class FakeLlm implements LlmClient {
  calls: StructuredRequest<unknown>[] = [];
  responses: Record<string, unknown[]> = { analysis: [], digest: [], brief: [] };
  failNext: Record<string, Error | undefined> = {};

  queue(purpose: "analysis" | "digest" | "brief", data: unknown) {
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
    const fallback = req.purpose === "analysis" ? ANALYSIS_FIXTURE : req.purpose === "brief" ? BRIEF_FIXTURE : undefined;
    const data = (q.length ? q.shift() : fallback) as T;
    if (data === undefined) throw new Error(`FakeLlm: no response queued for ${req.purpose}`);
    // the schema must accept the response (checks that fixtures match the real schema)
    const parsed = req.schema.parse(data);
    return { data: parsed, usage: { inputTokens: 5000, outputTokens: 800, cacheReadTokens: 0, cacheWriteTokens: 0, model: req.model } };
  }
}

export class FakeTranscriber implements Transcriber {
  calls = 0;
  constructor(public text = "The light is great, this is one for the brand", public fail = false) {}
  async transcribe() {
    this.calls++;
    if (this.fail) throw new Error("broken");
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
