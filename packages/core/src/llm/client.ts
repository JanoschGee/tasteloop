/**
 * Thin interface to Claude. The rest of the code only knows LlmClient,
 * so tests run without real API calls (FakeLlm in the tests).
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export type LlmContent =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; base64: string };

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  model: string;
}

export interface StructuredRequest<T> {
  /** what for (logging, costs) */
  purpose: "analysis" | "digest" | "brief";
  model: string;
  system: string;
  content: LlmContent[];
  schema: z.ZodType<T>;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}

export interface LlmClient {
  structured<T>(req: StructuredRequest<T>): Promise<{ data: T; usage: LlmUsage }>;
}

export class LlmError extends Error {
  constructor(msg: string, readonly retryable = false) {
    super(msg);
    this.name = "LlmError";
  }
}

export class AnthropicLlm implements LlmClient {
  private client: Anthropic;

  constructor(apiKey: string, opts: { timeoutMs?: number } = {}) {
    this.client = new Anthropic({ apiKey, timeout: opts.timeoutMs ?? 5 * 60_000, maxRetries: 3 });
  }

  async structured<T>(req: StructuredRequest<T>): Promise<{ data: T; usage: LlmUsage }> {
    const content = req.content.map((c) =>
      c.type === "text"
        ? ({ type: "text", text: c.text } as const)
        : ({ type: "image", source: { type: "base64", media_type: c.mediaType, data: c.base64 } } as const),
    );
    try {
      const msg = await this.client.beta.messages.parse({
        model: req.model,
        max_tokens: req.maxTokens ?? 16000,
        // the system prompt with the guide is stable -> cache it
        system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content }],
        output_config: { format: betaZodOutputFormat(req.schema), effort: req.effort ?? "medium" },
        // if a safety classifier declines, a fallback model takes over on the server
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      if (msg.stop_reason === "refusal") {
        throw new LlmError("Claude declined the request (refusal).");
      }
      if (msg.stop_reason === "max_tokens") {
        throw new LlmError("Response cut off (max_tokens).", true);
      }
      if (msg.parsed_output == null) throw new LlmError("Response did not match the schema.", true);
      return {
        data: msg.parsed_output as T,
        usage: {
          inputTokens: msg.usage.input_tokens,
          outputTokens: msg.usage.output_tokens,
          cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0,
          cacheWriteTokens: msg.usage.cache_creation_input_tokens ?? 0,
          model: msg.model,
        },
      };
    } catch (err) {
      if (err instanceof LlmError) throw err;
      if (err instanceof Anthropic.RateLimitError) throw new LlmError("Claude: rate limit reached, try again later.", true);
      if (err instanceof Anthropic.AuthenticationError) throw new LlmError("Claude: invalid API key.");
      if (err instanceof Anthropic.BadRequestError) throw new LlmError(`Claude: invalid request (${err.message}).`);
      if (err instanceof Anthropic.APIConnectionError) throw new LlmError("Claude: no connection.", true);
      if (err instanceof Anthropic.APIError) throw new LlmError(`Claude: API error ${err.status ?? ""}.`, true);
      throw err;
    }
  }
}

/** Rough cost in USD (prices per million tokens, as of 11/2026; update when needed). */
export const PREISE_USD_PRO_MIO: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};

export function costUsd(u: LlmUsage): number | undefined {
  const key = Object.keys(PREISE_USD_PRO_MIO).find((k) => u.model.startsWith(k));
  if (!key) return undefined;
  const p = PREISE_USD_PRO_MIO[key];
  return (
    (u.inputTokens * p.input + u.outputTokens * p.output + u.cacheReadTokens * p.cacheRead + u.cacheWriteTokens * p.cacheWrite) /
    1_000_000
  );
}
