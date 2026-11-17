import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { silentLogger } from "../src/log";
import { HttpTelegramApi, TelegramError } from "../src/telegram/api";
import { ChainTranscriber, ElevenLabsTranscriber, WhisperCppTranscriber, buildTranscriber, type Exec } from "../src/transcribe/transcribe";
import { makeVault } from "./helpers";

function modelFile() {
  const d = mkdtempSync(join(tmpdir(), "ab-model-"));
  const f = join(d, "ggml.bin");
  writeFileSync(f, "x");
  return f;
}

describe("whisper.cpp", () => {
  it("konvertiert per ffmpeg nach 16 kHz WAV und liest die Textausgabe", async () => {
    const calls: { cmd: string; args: string[] }[] = [];
    const exec: Exec = async (cmd, args) => {
      calls.push({ cmd, args });
      if (cmd === "whisper-cli") writeFileSync(args[args.indexOf("-of") + 1] + ".txt", "  Hallo   Welt \n");
      return { stdout: "", stderr: "" };
    };
    const t = new WhisperCppTranscriber({ binary: "whisper-cli", model: modelFile(), ffmpeg: "ffmpeg", language: "de", timeoutSec: 5 }, exec);
    const r = await t.transcribe(Buffer.from("ogg"), "file_1.oga");
    expect(r).toEqual({ text: "Hallo Welt", engine: "whisper.cpp" });
    expect(calls[0].args).toEqual(expect.arrayContaining(["-ar", "16000", "-ac", "1"]));
    expect(calls[1].args).toEqual(expect.arrayContaining(["-l", "de", "-otxt"]));
  });
  it("fällt auf die API zurück, wenn lokal etwas fehlt", async () => {
    const fetchFn = (async (url: string, init: RequestInit) => {
      expect(url).toBe("https://api.elevenlabs.io/v1/speech-to-text");
      expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("k");
      return new Response(JSON.stringify({ text: "Aus der API" }), { status: 200 });
    }) as unknown as typeof fetch;
    const chain = new ChainTranscriber(
      [
        new WhisperCppTranscriber({ binary: "whisper-cli", model: "/gibt/es/nicht.bin", ffmpeg: "ffmpeg", language: "de", timeoutSec: 5 }),
        new ElevenLabsTranscriber("k", "scribe_v1", "de", fetchFn),
      ],
      silentLogger,
    );
    expect(await chain.transcribe(Buffer.from("x"), "a.oga")).toEqual({ text: "Aus der API", engine: "elevenlabs/scribe_v1" });
  });
  it("ohne Fallback-Key gibt es eine klare Fehlermeldung", async () => {
    const { cfg } = makeVault((c) => {
      c.transkription.lokal.aktiv = false;
      c.transkription.api.aktiv = true;
    });
    const t = buildTranscriber(cfg, {}, silentLogger);
    await expect(t.transcribe(Buffer.from("x"), "a.oga")).rejects.toThrow(/kein Transkriber/);
  });
});

describe("Telegram-HTTP-Client", () => {
  const token = "123456789:" + "T".repeat(35);
  it("ruft die Bot-API mit Long Polling auf", async () => {
    const seen: { url: string; body: Record<string, unknown> }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ ok: true, result: [] }));
    }) as unknown as typeof fetch;
    await new HttpTelegramApi(token, fetchFn).getUpdates(42, 50);
    expect(seen[0].url).toBe(`https://api.telegram.org/bot${token}/getUpdates`);
    expect(seen[0].body).toMatchObject({ offset: 42, timeout: 50, allowed_updates: ["message", "callback_query"] });
  });
  it("Fehlermeldungen enthalten nie den Token", async () => {
    const fetchFn = (async () => new Response(JSON.stringify({ ok: false, description: "Unauthorized" }), { status: 401 })) as unknown as typeof fetch;
    const err = await new HttpTelegramApi(token, fetchFn).sendMessage(1, "x").catch((e) => e);
    expect(err).toBeInstanceOf(TelegramError);
    expect(String(err.message)).not.toContain("TTTT");
  });
  it("lädt Dateien über getFile herunter", async () => {
    const fetchFn = (async (url: string) => {
      if (url.endsWith("/getFile")) return new Response(JSON.stringify({ ok: true, result: { file_path: "voice/file_1.oga" } }));
      expect(url).toBe(`https://api.telegram.org/file/bot${token}/voice/file_1.oga`);
      return new Response(new Uint8Array([1, 2, 3]));
    }) as unknown as typeof fetch;
    const r = await new HttpTelegramApi(token, fetchFn).downloadFile("f");
    expect([...r.data]).toEqual([1, 2, 3]);
  });
});
