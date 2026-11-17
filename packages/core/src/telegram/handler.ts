/**
 * Verarbeitung der Telegram-Updates.
 *
 * Ablauf:
 *  1. Bild (Foto oder Bild-Datei) in der Gruppe -> Bild + Notiz im Vault (ebene: offen),
 *     Bot antwortet mit Knöpfen Brand / Kampagne / Nur merken (Vorschlag markiert).
 *  2. Sprachnachricht als Antwort auf das Bild oder die Bot-Bestätigung (oder kurz danach
 *     vom selben Absender) -> Transkript in die Notiz, Vorschlag aktualisieren.
 *  3. Knopf -> Ebene setzen, Claude-Analyse, Moodboard, bei Kampagne Briefing.
 *     Knöpfe bleiben stehen: erneut tippen ändert die Ebene.
 *  4. Text-Antwort auf Bild/Bestätigung -> Korrektur (wird in die Notiz geschrieben, Analyse neu).
 *  5. „/löschen“ als Antwort -> Notiz, Bild, Briefing in den Obsidian-Papierkorb, raus aus dem Moodboard.
 */
import { extname } from "node:path";
import { suggestLevel, DEFAULT_STICHWORTE } from "../level";
import type { Services } from "../services";
import type { BotState } from "../state";
import { localIso, newUploadId } from "../util";
import { removeCanvasImage, upsertCanvasImage } from "../vault/canvas";
import { EBENEN, EBENEN_LABEL, readUpload, uploadNotePath, writeUpload, type Ebene, type Upload } from "../vault/uploads";
import { analyseUpload } from "../jobs/analyse";
import type { InlineKeyboard, TelegramApi, TgCallbackQuery, TgMessage, TgUpdate } from "./api";

const DELETE_CMD = /^\/(l(ö|oe|o)schen|delete)(@\w+)?\s*$/i;
const HELP_CMD = /^\/(hilfe|help|start)(@\w+)?\s*$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;

export class TelegramHandler {
  constructor(
    private svc: Services,
    private tg: TelegramApi,
    private state: BotState,
  ) {}

  private get chatId() {
    return this.svc.cfg.telegram.chat_id;
  }

  senderName(user?: { id: number; first_name?: string; username?: string }): string | undefined {
    if (!user) return undefined;
    const known = this.svc.cfg.telegram.absender[String(user.id)];
    if (known) return known;
    if (this.svc.cfg.telegram.nur_bekannte_absender) return undefined;
    return user.first_name || user.username || String(user.id);
  }

  keyboard(id: string, u: Pick<Upload, "ebene" | "vorgeschlageneEbene">): InlineKeyboard {
    return [
      EBENEN.map((e) => {
        const mark = u.ebene === e ? "✅ " : u.ebene === "offen" && u.vorgeschlageneEbene === e ? "👉 " : "";
        return { text: `${mark}${EBENEN_LABEL[e]}`, callback_data: `lvl:${id}:${e}` };
      }),
    ];
  }

  statusText(u: Upload, extra?: string): string {
    const lines = [`Erfasst: ${u.id} (von ${u.absender})`];
    if (u.ebene === "offen") {
      lines.push(u.vorgeschlageneEbene ? `Vorschlag: ${EBENEN_LABEL[u.vorgeschlageneEbene]}. Bitte Ebene wählen.` : "Welche Ebene?");
    } else {
      lines.push(`Ebene: ${EBENEN_LABEL[u.ebene]}`);
    }
    if (u.transkript.length) lines.push(`🎙 Transkript: ${u.transkript.join(" ").slice(0, 300)}`);
    if (u.status === "analysiert" || u.status === "im-digest") {
      if (u.analyse) lines.push(`🔎 ${u.analyse.kurzbeschreibung.slice(0, 300)}`);
    }
    if (u.status === "fehler" && u.fehler) lines.push(`⚠️ ${u.fehler.slice(0, 200)} Zum Wiederholen Ebene erneut antippen.`);
    if (u.briefing) lines.push(`📝 Briefing: ${u.briefing.split("/").pop()?.replace(/\.md$/, "")}`);
    if (extra) lines.push(extra);
    lines.push("Antwort mit Text = Korrektur, mit /löschen = entfernen.");
    return lines.join("\n");
  }

  async refreshBotMessage(u: Upload, extra?: string) {
    const ref = this.state.data.uploads[u.id];
    if (!ref?.botMessageId) return;
    try {
      await this.tg.editMessageText(ref.chatId, ref.botMessageId, this.statusText(u, extra), this.keyboard(u.id, u));
    } catch (err) {
      this.svc.log.warn("Bot-Nachricht nicht aktualisiert", { id: u.id, fehler: String(err) });
    }
  }

  /** Verarbeitet ein Update. Wirft nicht (Fehler werden geloggt und, wo sinnvoll, im Chat gemeldet). */
  async handleUpdate(update: TgUpdate): Promise<void> {
    if (!this.state.markUpdate(update.update_id)) return;
    try {
      if (update.callback_query) await this.onCallback(update.callback_query);
      else if (update.message) await this.onMessage(update.message);
    } catch (err) {
      this.svc.log.error("Update-Verarbeitung fehlgeschlagen", { update: update.update_id, fehler: err instanceof Error ? err.stack : String(err) });
      const chat = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
      if (chat === this.chatId) {
        await this.tg
          .sendMessage(this.chatId, `⚠️ Das hat nicht geklappt: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500), {
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
      this.svc.log.warn("Nachricht aus fremdem Chat ignoriert", { chat: msg.chat.id });
      return;
    }
    if (msg.from?.is_bot) return;
    const absender = this.senderName(msg.from);
    if (!absender) {
      this.svc.log.warn("Unbekannter Absender ignoriert", { user: msg.from?.id });
      return;
    }
    const text = (msg.text ?? "").trim();

    if (HELP_CMD.test(text)) {
      await this.tg.sendMessage(
        this.chatId,
        "So geht's: Bild schicken, Begründung als Bildunterschrift oder als Sprachnachricht (Antwort auf das Bild). Dann Ebene wählen: Brand, Kampagne oder Nur merken. Antwort auf meine Bestätigung mit Text = Korrektur, mit /löschen = entfernen.",
        { replyTo: msg.message_id },
      );
      return;
    }

    const image = this.imageOf(msg);
    if (image) return this.onImage(msg, absender, image);

    if (DELETE_CMD.test(text)) return this.onDelete(msg);

    if (msg.voice || msg.audio) return this.onVoice(msg, absender);

    if (text && msg.reply_to_message) {
      const id = this.resolveUploadId(msg.reply_to_message);
      if (id && !text.startsWith("/")) return this.onCorrection(msg, absender, id, text);
    }
    // sonstige Nachrichten (Unterhaltung in der Gruppe) ignorieren
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

  async onImage(msg: TgMessage, absender: string, image: { fileId: string; ext: string }) {
    const v = this.svc.vault;
    const now = this.svc.now();
    let id = newUploadId(now);
    while (v.exists(uploadNotePath(v, id))) id = newUploadId(now);
    const file = await this.tg.downloadFile(image.fileId);
    const bild = `${v.dirs.bilder}/${id}${image.ext}`;
    v.writeBytes(bild, file.data);
    const begruendung = (msg.caption ?? "").trim();
    const u: Upload = {
      id,
      marke: this.svc.cfg.marke.name,
      ebene: "offen",
      vorgeschlageneEbene: suggestLevel(begruendung, this.svc.cfg.ebenen_stichworte ?? DEFAULT_STICHWORTE),
      absender,
      datum: localIso(now),
      status: "neu",
      bild,
      begruendung,
      transkript: [],
      korrekturen: [],
      telegramNachricht: msg.message_id,
      extraSections: [],
    };
    writeUpload(v, u);
    upsertCanvasImage(v, id, bild, "offen");
    this.state.data.uploads[id] = { chatId: msg.chat.id, photoMessageId: msg.message_id, senderId: msg.from!.id, createdAt: now.getTime() };
    this.state.link(msg.chat.id, msg.message_id, id);
    const sent = await this.tg.sendMessage(this.chatId, this.statusText(u), { replyTo: msg.message_id, keyboard: this.keyboard(id, u) });
    this.state.data.uploads[id].botMessageId = sent.message_id;
    this.state.link(msg.chat.id, sent.message_id, id);
    this.svc.log.info("Upload erfasst", { id, absender });
  }

  async onVoice(msg: TgMessage, absender: string) {
    const now = this.svc.now().getTime();
    let id = this.resolveUploadId(msg.reply_to_message);
    if (!id && msg.from) {
      id = this.state.lastUploadOf(msg.chat.id, msg.from.id, now, this.svc.cfg.telegram.zuordnung_minuten * 60_000);
    }
    if (!id) {
      await this.tg.sendMessage(this.chatId, "Zu welchem Bild gehört das? Bitte die Sprachnachricht als Antwort auf das Bild schicken.", {
        replyTo: msg.message_id,
      });
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
      this.svc.log.info("Transkribiert", { id, engine: r.engine, zeichen: text.length });
    } catch (err) {
      await this.tg.sendMessage(this.chatId, `⚠️ Sprachnachricht konnte nicht transkribiert werden. Bitte als Text antworten.`, {
        replyTo: msg.message_id,
      });
      this.svc.log.error("Transkription fehlgeschlagen", { id, fehler: String(err) });
      return;
    }
    this.state.link(msg.chat.id, msg.message_id, id);
    u.transkript.push(absender === u.absender ? text : `${absender}: ${text}`);
    if (u.ebene === "offen") {
      u.vorgeschlageneEbene = suggestLevel([u.begruendung, ...u.transkript].join(" "), this.svc.cfg.ebenen_stichworte ?? DEFAULT_STICHWORTE) ?? u.vorgeschlageneEbene;
      writeUpload(this.svc.vault, u);
      await this.refreshBotMessage(u);
    } else {
      writeUpload(this.svc.vault, u);
      await this.reanalyse(u.id, "Transkript ergänzt, Analyse aktualisiert.");
    }
  }

  async onCorrection(msg: TgMessage, absender: string, id: string, text: string) {
    const u = readUpload(this.svc.vault, id);
    if (!u) return;
    u.korrekturen.push({ zeit: localIso(this.svc.now()), absender, text });
    writeUpload(this.svc.vault, u);
    this.state.link(msg.chat.id, msg.message_id, id);
    if (u.ebene === "offen") {
      await this.refreshBotMessage(u, "✏️ Korrektur notiert.");
    } else {
      await this.reanalyse(id, "✏️ Korrektur notiert, Analyse aktualisiert.");
    }
  }

  async onDelete(msg: TgMessage) {
    const id = this.resolveUploadId(msg.reply_to_message);
    if (!id) {
      await this.tg.sendMessage(this.chatId, "Bitte /löschen als Antwort auf das Bild oder auf meine Bestätigung schicken.", { replyTo: msg.message_id });
      return;
    }
    const v = this.svc.vault;
    const u = readUpload(v, id);
    const moved: string[] = [];
    if (u) {
      for (const p of [uploadNotePath(v, id), u.bild, u.briefing].filter((x): x is string => !!x)) {
        const t = v.trash(p);
        if (t) moved.push(t);
      }
    }
    removeCanvasImage(v, id);
    const ref = this.state.data.uploads[id];
    this.state.forget(id);
    if (ref?.botMessageId) {
      await this.tg.editMessageText(ref.chatId, ref.botMessageId, `🗑 ${id} gelöscht (liegt im Obsidian-Papierkorb).`).catch(() => {});
    }
    await this.tg.sendMessage(this.chatId, `🗑 ${id} gelöscht.`, { replyTo: msg.message_id });
    this.svc.log.info("Upload gelöscht", { id, verschoben: moved.length });
  }

  async onCallback(q: TgCallbackQuery) {
    const m = /^lvl:([\w-]+):(brand|kampagne|merken)$/.exec(q.data ?? "");
    if (!m || q.message?.chat.id !== this.chatId) {
      await this.tg.answerCallbackQuery(q.id);
      return;
    }
    if (!this.senderName(q.from)) {
      await this.tg.answerCallbackQuery(q.id, "Nicht freigeschaltet.");
      return;
    }
    const [, id, ebene] = m;
    const u = readUpload(this.svc.vault, id);
    if (!u) {
      await this.tg.answerCallbackQuery(q.id, "Upload nicht mehr vorhanden.");
      return;
    }
    const wasBriefing = u.briefing;
    u.ebene = ebene as Ebene;
    if (u.ebene !== "kampagne" && wasBriefing) {
      // Briefing gehört nicht mehr zur Ebene: in den Papierkorb
      this.svc.vault.trash(wasBriefing);
      u.briefing = undefined;
    }
    writeUpload(this.svc.vault, u);
    await this.tg.answerCallbackQuery(q.id, `Ebene: ${EBENEN_LABEL[u.ebene]}`);
    // Bot-Nachricht kennen, auch wenn der State verloren ging
    if (q.message && !this.state.data.uploads[id]) {
      this.state.data.uploads[id] = { chatId: q.message.chat.id, photoMessageId: q.message.reply_to_message?.message_id ?? 0, botMessageId: q.message.message_id, senderId: q.from.id, createdAt: Date.now() };
    }
    await this.refreshBotMessage(u, u.ebene === "merken" && !this.svc.cfg.analyse_bei_merken ? undefined : "⏳ Analyse läuft …");
    await this.reanalyse(id);
  }

  async reanalyse(id: string, extra?: string) {
    const r = await analyseUpload(this.svc, id);
    await this.refreshBotMessage(r.upload, extra);
  }
}

/** Long-Polling-Schleife. Endet, wenn signal abgebrochen wird. */
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
      svc.log.warn("getUpdates fehlgeschlagen, neuer Versuch", { fehler: err instanceof Error ? err.message : String(err), warteMs: backoff });
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 60_000);
    }
  }
}
