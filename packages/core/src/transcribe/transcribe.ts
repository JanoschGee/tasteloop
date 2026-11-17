/**
 * Voice note transcription.
 * 1. local: whisper.cpp (whisper-cli), audio converted to 16 kHz WAV with ffmpeg first (free)
 * 2. fallback: API (ElevenLabs Scribe or OpenAI), only if local fails and a key is set
 */
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrandConfig, Secrets } from "../config";
import type { Logger } from "../log";

export interface TranscriptResult {
  text: string;
  engine: string;
}

export interface Transcriber {
  transcribe(audio: Buffer, filename: string): Promise<TranscriptResult>;
}

export type Exec = (cmd: string, args: string[], opts: { timeoutMs: number }) => Promise<{ stdout: string; stderr: string }>;

export const nodeExec: Exec = (cmd, args, opts) =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: opts.timeoutMs, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr }));
      else resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });

export class WhisperCppTranscriber implements Transcriber {
  constructor(
    private opts: { binary: string; model: string; ffmpeg: string; language: string; timeoutSec: number },
    private exec: Exec = nodeExec,
  ) {}

  async transcribe(audio: Buffer, filename: string): Promise<TranscriptResult> {
    if (!existsSync(this.opts.model)) throw new Error(`Whisper model missing: ${this.opts.model}`);
    const dir = mkdtempSync(join(tmpdir(), "ab-whisper-"));
    try {
      const input = join(dir, filename.replace(/[^\w.-]/g, "_") || "audio.oga");
      const wav = join(dir, "audio.wav");
      writeFileSync(input, audio);
      const timeoutMs = this.opts.timeoutSec * 1000;
      await this.exec(this.opts.ffmpeg, ["-nostdin", "-y", "-loglevel", "error", "-i", input, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav], { timeoutMs });
      const outBase = join(dir, "out");
      await this.exec(
        this.opts.binary,
        ["-m", this.opts.model, "-l", this.opts.language, "-f", wav, "-otxt", "-of", outBase, "-np", "-nt"],
        { timeoutMs },
      );
      const text = readFileSync(`${outBase}.txt`, "utf8").replace(/\s+/g, " ").trim();
      if (!text) throw new Error("Whisper returned no text");
      return { text, engine: "whisper.cpp" };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

export type FetchFn = typeof fetch;

export class ElevenLabsTranscriber implements Transcriber {
  constructor(private apiKey: string, private model = "scribe_v1", private language = "de", private fetchFn: FetchFn = fetch) {}

  async transcribe(audio: Buffer, filename: string): Promise<TranscriptResult> {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)]), filename);
    form.append("model_id", this.model);
    form.append("language_code", this.language);
    const res = await this.fetchFn("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": this.apiKey },
      body: form,
    });
    if (!res.ok) throw new Error(`ElevenLabs STT: HTTP ${res.status}`);
    const json = (await res.json()) as { text?: string };
    if (!json.text) throw new Error("ElevenLabs STT: no text");
    return { text: json.text.trim(), engine: `elevenlabs/${this.model}` };
  }
}

export class OpenAiTranscriber implements Transcriber {
  constructor(private apiKey: string, private model = "gpt-4o-mini-transcribe", private language = "de", private fetchFn: FetchFn = fetch) {}

  async transcribe(audio: Buffer, filename: string): Promise<TranscriptResult> {
    const form = new FormData();
    // Telegram voice notes are OGG/Opus; .ogg is accepted
    form.append("file", new Blob([new Uint8Array(audio)]), filename.replace(/\.oga$/, ".ogg"));
    form.append("model", this.model);
    form.append("language", this.language);
    const res = await this.fetchFn("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}` },
      body: form,
    });
    if (!res.ok) throw new Error(`OpenAI STT: HTTP ${res.status}`);
    const json = (await res.json()) as { text?: string };
    if (!json.text) throw new Error("OpenAI STT: no text");
    return { text: json.text.trim(), engine: `openai/${this.model}` };
  }
}

/** Tries the transcribers in order. */
export class ChainTranscriber implements Transcriber {
  constructor(private chain: Transcriber[], private log: Logger) {}

  async transcribe(audio: Buffer, filename: string): Promise<TranscriptResult> {
    const errors: string[] = [];
    for (const t of this.chain) {
      try {
        return await t.transcribe(audio, filename);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(msg);
        this.log.warn(`Transcription failed (${t.constructor.name}), trying the next one`, { error: msg });
      }
    }
    throw new Error(`Transcription not possible: ${errors.join(" | ") || "no transcriber configured"}`);
  }
}

export function buildTranscriber(cfg: BrandConfig, secrets: Secrets, log: Logger, exec: Exec = nodeExec, fetchFn: FetchFn = fetch): Transcriber {
  const chain: Transcriber[] = [];
  const t = cfg.transcription;
  if (t.local.enabled) {
    chain.push(
      new WhisperCppTranscriber(
        { binary: t.local.binary, model: t.local.model, ffmpeg: t.local.ffmpeg, language: t.local.language, timeoutSec: t.local.timeout_seconds },
        exec,
      ),
    );
  }
  if (t.api.enabled) {
    if (t.api.provider === "elevenlabs" && secrets.elevenlabsApiKey) {
      chain.push(new ElevenLabsTranscriber(secrets.elevenlabsApiKey, t.api.model ?? "scribe_v1", t.local.language, fetchFn));
    } else if (t.api.provider === "openai" && secrets.openaiApiKey) {
      chain.push(new OpenAiTranscriber(secrets.openaiApiKey, t.api.model ?? "gpt-4o-mini-transcribe", t.local.language, fetchFn));
    }
  }
  return new ChainTranscriber(chain, log);
}
