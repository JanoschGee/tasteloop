/**
 * Minimaler Telegram-Bot-API-Client (Long Polling). Keine Abhängigkeit,
 * fetch ist injizierbar, damit Tests ohne Netz laufen.
 * Der Token taucht nie in Logs oder Fehlermeldungen auf.
 */
export interface TgUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
}
export interface TgChat {
  id: number;
  type: string;
  title?: string;
}
export interface TgPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}
export interface TgMessage {
  message_id: number;
  date: number;
  chat: TgChat;
  from?: TgUser;
  text?: string;
  caption?: string;
  photo?: TgPhotoSize[];
  document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
  voice?: { file_id: string; duration: number; mime_type?: string; file_size?: number };
  audio?: { file_id: string; duration: number; mime_type?: string; file_name?: string };
  reply_to_message?: TgMessage;
  media_group_id?: string;
}
export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
}
export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}
export interface InlineButton {
  text: string;
  callback_data: string;
}
export type InlineKeyboard = InlineButton[][];

export interface TelegramApi {
  getUpdates(offset: number, timeoutSec: number): Promise<TgUpdate[]>;
  sendMessage(chatId: number, text: string, opts?: { replyTo?: number; keyboard?: InlineKeyboard }): Promise<TgMessage>;
  editMessageText(chatId: number, messageId: number, text: string, keyboard?: InlineKeyboard): Promise<void>;
  answerCallbackQuery(id: string, text?: string): Promise<void>;
  downloadFile(fileId: string): Promise<{ data: Buffer; path: string }>;
}

export class TelegramError extends Error {
  constructor(method: string, readonly status: number, description: string) {
    super(`Telegram ${method}: ${status} ${description}`);
    this.name = "TelegramError";
  }
}

export class HttpTelegramApi implements TelegramApi {
  private base: string;
  private fileBase: string;

  constructor(token: string, private fetchFn: typeof fetch = fetch) {
    this.base = `https://api.telegram.org/bot${token}`;
    this.fileBase = `https://api.telegram.org/file/bot${token}`;
  }

  private async call<T>(method: string, body: Record<string, unknown>, timeoutMs = 30_000): Promise<T> {
    const res = await this.fetchFn(`${this.base}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
    if (!json.ok) throw new TelegramError(method, res.status, json.description ?? "unbekannter Fehler");
    return json.result as T;
  }

  getUpdates(offset: number, timeoutSec: number) {
    return this.call<TgUpdate[]>(
      "getUpdates",
      { offset, timeout: timeoutSec, allowed_updates: ["message", "callback_query"] },
      (timeoutSec + 15) * 1000,
    );
  }

  sendMessage(chatId: number, text: string, opts: { replyTo?: number; keyboard?: InlineKeyboard } = {}) {
    return this.call<TgMessage>("sendMessage", {
      chat_id: chatId,
      text,
      link_preview_options: { is_disabled: true },
      ...(opts.replyTo ? { reply_parameters: { message_id: opts.replyTo, allow_sending_without_reply: true } } : {}),
      ...(opts.keyboard ? { reply_markup: { inline_keyboard: opts.keyboard } } : {}),
    });
  }

  async editMessageText(chatId: number, messageId: number, text: string, keyboard?: InlineKeyboard) {
    try {
      await this.call("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text,
        link_preview_options: { is_disabled: true },
        reply_markup: { inline_keyboard: keyboard ?? [] },
      });
    } catch (err) {
      // "message is not modified" ist kein Fehler
      if (err instanceof TelegramError && /not modified/i.test(err.message)) return;
      throw err;
    }
  }

  async answerCallbackQuery(id: string, text?: string) {
    await this.call("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
  }

  async downloadFile(fileId: string) {
    const file = await this.call<{ file_path?: string }>("getFile", { file_id: fileId });
    if (!file.file_path) throw new TelegramError("getFile", 0, "kein file_path (Datei > 20 MB?)");
    const res = await this.fetchFn(`${this.fileBase}/${file.file_path}`, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new TelegramError("download", res.status, "Download fehlgeschlagen");
    return { data: Buffer.from(await res.arrayBuffer()), path: file.file_path };
  }
}
