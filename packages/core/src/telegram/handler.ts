/**
 * Handling of Telegram updates.
 *
 * Flow:
 *  1. Image (photo or image file) in the group -> image + note in the vault (level: open),
 *     the bot replies with the buttons Brand / Campaign / Just keep (suggestion marked).
 *  2. Voice note as a reply to the image or the bot's message (or shortly after, same sender)
 *     -> transcript into the note, suggestion updated.
 *  3. Button -> set level, Claude analysis, moodboard, brief for campaigns.
 *     The buttons stay: tapping again changes the level.
 *  4. Text reply to the image or the bot's message -> correction (stored, analysis runs again).
 *  5. "/delete" as a reply -> note, image and brief go to Obsidian's trash, image leaves the moodboard.
 */
import { extname } from "node:path";
import { analyseUpload } from "../jobs/analyse";
import { DEFAULT_KEYWORDS, suggestLevel } from "../level";
import type { Services } from "../services";
import type { BotState } from "../state";
import { localIso, newUploadId } from "../util";
import { removeCanvasImage, upsertCanvasImage } from "../vault/canvas";
import { LEVELS, LEVEL_LABEL, readUpload, uploadNotePath, writeUpload, type Level, type Upload } from "../vault/uploads";
import type { InlineKeyboard, TelegramApi, TgCallbackQuery, TgMessage, TgUpdate } from "./api";

const DELETE_CMD = /^\/(delete|l(ö|oe|o)schen)(@\w+)?\s*$/i;
const HELP_CMD = /^\/(help|start|hilfe)(@\w+)?\s*$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;
/** button data from messages sent before the switch to English */
const LEGACY_LEVEL: Record<string, Level> = { kampagne: "campaign", merken: "keep" };

export const HELP_TEXT =
  "How it works: send an image and give the reason as a caption or as a voice note (reply to the image). Then pick a level: Brand, Campaign or Just keep. Reply to my message with text to correct it, or with /delete to remove it.";

export class TelegramHandler {
  constructor(
    private svc: Services,
    private tg: TelegramApi,
    private state: BotState,
  ) {}

  private get chatId() {
    return this.svc.cfg.telegram.chat_id;
  }

  private get keywords() {
    return this.svc.cfg.level_keywords ?? DEFAULT_KEYWORDS;
  }

  senderName(user?: { id: number; first_name?: string; username?: string }): string | undefined {
    if (!user) return undefined;
    const known = this.svc.cfg.telegram.senders[String(user.id)];
    if (known) return known;
    if (this.svc.cfg.telegram.known_senders_only) return undefined;
    return user.first_name || user.username || String(user.id);
  }

  keyboard(id: string, u: Pick<Upload, "level" | "suggestedLevel">): InlineKeyboard {
    return [
      LEVELS.map((e) => {
        const mark = u.level === e ? "✅ " : u.level === "open" && u.suggestedLevel === e ? "👉 " : "";
        return { text: `${mark}${LEVEL_LABEL[e]}`, callback_data: `lvl:${id}:${e}` };
      }),
    ];
  }

  statusText(u: Upload, extra?: string): string {
    const lines = [`Saved: ${u.id} (from ${u.sender})`];
    if (u.level === "open") {
      lines.push(u.suggestedLevel ? `Suggestion: ${LEVEL_LABEL[u.suggestedLevel]}. Please pick a level.` : "Which level?");
    } else {
      lines.push(`Level: ${LEVEL_LABEL[u.level]}`);
    }
    if (u.transcript.length) lines.push(`🎙 Transcript: ${u.transcript.join(" ").slice(0, 300)}`);
    if ((u.status === "analyzed" || u.status === "in_digest") && u.analysis) lines.push(`🔎 ${u.analysis.summary.slice(0, 300)}`);
    if (u.status === "error" && u.error) lines.push(`⚠️ ${u.error.slice(0, 200)} Tap the level again to retry.`);
    if (u.brief) lines.push(`📝 Brief: ${u.brief.split("/").pop()?.replace(/\.md$/, "")}`);
    if (extra) lines.push(extra);
    lines.push("Reply with text to correct, with /delete to remove.");
    return lines.join("\n");
  }

  async refreshBotMessage(u: Upload, extra?: string) {
    const ref = this.state.data.uploads[u.id];
    if (!ref?.botMessageId) return;
    try {
      await this.tg.editMessageText(ref.chatId, ref.botMessageId, this.statusText(u, extra), this.keyboard(u.id, u));
    } catch (err) {
      this.svc.log.warn("Bot message not updated", { id: u.id, error: String(err) });
    }
  }

  /** Handles one update. Never throws (errors are logged and, where useful, reported in the chat). */
  async handleUpdate(update: TgUpdate): Promise<void> {
    if (!this.state.markUpdate(update.update_id)) return;
    try {
      if (update.callback_query) await this.onCallback(update.callback_query);
      else if (update.message) await this.onMessage(update.message);
    } catch (err) {
      this.svc.log.error("Update failed", { update: update.update_id, error: err instanceof Error ? err.stack : String(err) });
      const chat = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
      if (chat === this.chatId) {
        await this.tg
          .sendMessage(this.chatId, `⚠️ That didn't work: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500), {
            replyTo: update.message?.message_id,
          })
          .catch(() => {});
      }
    } finally {
      this.state.data.offset = Math.max(this.state.data.offset, update.update_id + 1);
      this.state.save();
    }
  }

  private resolveUploadId(msg: TgMessage | undefined): string | undefined {
    if (!msg) return undefined;
    return this.state.lookup(msg.chat.id, msg.message_id);
  }

  async onMessage(msg: TgMessage): Promise<void> {
    if (msg.chat.id !== this.chatId) {
      this.svc.log.warn("Message from another chat ignored", { chat: msg.chat.id });
      return;
    }
    if (msg.from?.is_bot) return;
    const sender = this.senderName(msg.from);
    if (!sender) {
      this.svc.log.warn("Unknown sender ignored", { user: msg.from?.id });
      return;
    }
    const text = (msg.text ?? "").trim();

    if (HELP_CMD.test(text)) {
      await this.tg.sendMessage(this.chatId, HELP_TEXT, { replyTo: msg.message_id });
      return;
    }

    const image = this.imageOf(msg);
    if (image) return this.onImage(msg, sender, image);

    if (DELETE_CMD.test(text)) return this.onDelete(msg);

    if (msg.voice || msg.audio) return this.onVoice(msg, sender);

    if (text && msg.reply_to_message) {
      const id = this.resolveUploadId(msg.reply_to_message);
      if (id && !text.startsWith("/")) return this.onCorrection(msg, sender, id, text);
    }
    // anything else (conversation in the group) is ignored
  }

  private imageOf(msg: TgMessage): { fileId: string; ext: string } | undefined {
    if (msg.photo?.length) {
      const best = [...msg.photo].sort((a, b) => b.width * b.height - a.width * a.height)[0];
      return { fileId: best.file_id, ext: ".jpg" };
    }
    const d = msg.document;
    if (d && (d.mime_type?.startsWith("image/") || IMAGE_EXT.test(d.file_name ?? ""))) {
      const ext = (extname(d.file_name ?? "").toLowerCase() || `.${d.mime_type?.split("/")[1] ?? "jpg"}`).replace(".jpeg", ".jpg");
      return { fileId: d.file_id, ext: IMAGE_EXT.test(ext) ? ext : ".jpg" };
    }
    return undefined;
  }

  async onImage(msg: TgMessage, sender: string, image: { fileId: string; ext: string }) {
    const v = this.svc.vault;
    const now = this.svc.now();
    let id = newUploadId(now);
    while (v.exists(uploadNotePath(v, id))) id = newUploadId(now);
    const file = await this.tg.downloadFile(image.fileId);
    const imagePath = `${v.dirs.images}/${id}${image.ext}`;
    v.writeBytes(imagePath, file.data);
    const why = (msg.caption ?? "").trim();
    const u: Upload = {
      id,
      brand: this.svc.cfg.brand.name,
      level: "open",
      suggestedLevel: suggestLevel(why, this.keywords),
      sender,
      date: localIso(now),
      status: "new",
      image: imagePath,
      why,
      transcript: [],
      corrections: [],
      messageId: msg.message_id,
      extraSections: [],
    };
    writeUpload(v, u);
    upsertCanvasImage(v, id, imagePath, "open");
    this.state.data.uploads[id] = { chatId: msg.chat.id, photoMessageId: msg.message_id, senderId: msg.from!.id, createdAt: now.getTime() };
    this.state.link(msg.chat.id, msg.message_id, id);
    const sent = await this.tg.sendMessage(this.chatId, this.statusText(u), { replyTo: msg.message_id, keyboard: this.keyboard(id, u) });
    this.state.data.uploads[id].botMessageId = sent.message_id;
    this.state.link(msg.chat.id, sent.message_id, id);
    this.svc.log.info("Upload saved", { id, sender });
  }

  async onVoice(msg: TgMessage, sender: string) {
    const now = this.svc.now().getTime();
    let id = this.resolveUploadId(msg.reply_to_message);
    if (!id && msg.from) {
      id = this.state.lastUploadOf(msg.chat.id, msg.from.id, now, this.svc.cfg.telegram.attach_minutes * 60_000);
    }
    if (!id) {
      await this.tg.sendMessage(this.chatId, "Which image is this for? Please send the voice note as a reply to the image.", { replyTo: msg.message_id });
      return;
    }
    const u = readUpload(this.svc.vault, id);
    if (!u) return;
    const fileId = (msg.voice ?? msg.audio)!.file_id;
    const file = await this.tg.downloadFile(fileId);
    const name = file.path.split("/").pop() ?? "voice.oga";
    let text: string;
    try {
      const r = await this.svc.transcriber.transcribe(file.data, name);
      text = r.text;
      this.svc.log.info("Transcribed", { id, engine: r.engine, chars: text.length });
    } catch (err) {
      await this.tg.sendMessage(this.chatId, "⚠️ The voice note could not be transcribed. Please reply with text instead.", { replyTo: msg.message_id });
      this.svc.log.error("Transcription failed", { id, error: String(err) });
      return;
    }
    this.state.link(msg.chat.id, msg.message_id, id);
    u.transcript.push(sender === u.sender ? text : `${sender}: ${text}`);
    if (u.level === "open") {
      u.suggestedLevel = suggestLevel([u.why, ...u.transcript].join(" "), this.keywords) ?? u.suggestedLevel;
      writeUpload(this.svc.vault, u);
      await this.refreshBotMessage(u);
    } else {
      writeUpload(this.svc.vault, u);
      await this.reanalyse(u.id, "Transcript added, analysis updated.");
    }
  }

  async onCorrection(msg: TgMessage, sender: string, id: string, text: string) {
    const u = readUpload(this.svc.vault, id);
    if (!u) return;
    u.corrections.push({ time: localIso(this.svc.now()), sender, text });
    writeUpload(this.svc.vault, u);
    this.state.link(msg.chat.id, msg.message_id, id);
    if (u.level === "open") {
      await this.refreshBotMessage(u, "✏️ Correction noted.");
    } else {
      await this.reanalyse(id, "✏️ Correction noted, analysis updated.");
    }
  }

  async onDelete(msg: TgMessage) {
    const id = this.resolveUploadId(msg.reply_to_message);
    if (!id) {
      await this.tg.sendMessage(this.chatId, "Please send /delete as a reply to the image or to my message.", { replyTo: msg.message_id });
      return;
    }
    const v = this.svc.vault;
    const u = readUpload(v, id);
    const moved: string[] = [];
    if (u) {
      for (const p of [uploadNotePath(v, id), u.image, u.brief].filter((x): x is string => !!x)) {
        const t = v.trash(p);
        if (t) moved.push(t);
      }
    }
    removeCanvasImage(v, id);
    const ref = this.state.data.uploads[id];
    this.state.forget(id);
    if (ref?.botMessageId) {
      await this.tg.editMessageText(ref.chatId, ref.botMessageId, `🗑 ${id} deleted (in Obsidian's trash).`).catch(() => {});
    }
    await this.tg.sendMessage(this.chatId, `🗑 ${id} deleted.`, { replyTo: msg.message_id });
    this.svc.log.info("Upload deleted", { id, moved: moved.length });
  }

  async onCallback(q: TgCallbackQuery) {
    const m = /^lvl:([\w-]+):(brand|campaign|keep|kampagne|merken)$/.exec(q.data ?? "");
    if (!m || q.message?.chat.id !== this.chatId) {
      await this.tg.answerCallbackQuery(q.id);
      return;
    }
    if (!this.senderName(q.from)) {
      await this.tg.answerCallbackQuery(q.id, "Not allowed.");
      return;
    }
    const id = m[1];
    const level: Level = LEGACY_LEVEL[m[2]] ?? (m[2] as Level);
    const u = readUpload(this.svc.vault, id);
    if (!u) {
      await this.tg.answerCallbackQuery(q.id, "This upload no longer exists.");
      return;
    }
    const oldBrief = u.brief;
    u.level = level;
    if (u.level !== "campaign" && oldBrief) {
      // the brief no longer belongs to the level: move it to the trash
      this.svc.vault.trash(oldBrief);
      u.brief = undefined;
    }
    writeUpload(this.svc.vault, u);
    await this.tg.answerCallbackQuery(q.id, `Level: ${LEVEL_LABEL[u.level]}`);
    // know the bot message even if the state was lost
    if (q.message && !this.state.data.uploads[id]) {
      this.state.data.uploads[id] = { chatId: q.message.chat.id, photoMessageId: q.message.reply_to_message?.message_id ?? 0, botMessageId: q.message.message_id, senderId: q.from.id, createdAt: Date.now() };
    }
    await this.refreshBotMessage(u, u.level === "keep" && !this.svc.cfg.analyze_keep ? undefined : "⏳ Analysing …");
    await this.reanalyse(id);
  }

  async reanalyse(id: string, extra?: string) {
    const r = await analyseUpload(this.svc, id);
    await this.refreshBotMessage(r.upload, extra);
  }
}

/** Long-polling loop. Ends when the signal is aborted. */
export async function runPolling(handler: TelegramHandler, tg: TelegramApi, state: BotState, svc: Services, signal: AbortSignal) {
  let backoff = 1000;
  while (!signal.aborted) {
    try {
      const updates = await tg.getUpdates(state.data.offset, 50);
      backoff = 1000;
      for (const u of updates) {
        if (signal.aborted) break;
        await handler.handleUpdate(u);
      }
    } catch (err) {
      svc.log.warn("getUpdates failed, retrying", { error: err instanceof Error ? err.message : String(err), waitMs: backoff });
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 60_000);
    }
  }
}
