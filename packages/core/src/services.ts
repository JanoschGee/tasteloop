import type { BrandConfig } from "./config";
import type { LlmClient } from "./llm/client";
import type { Logger } from "./log";
import type { Transcriber } from "./transcribe/transcribe";
import type { Vault } from "./vault/vault";

/** Alles, was die Jobs brauchen. In Tests mit Fakes befüllt. */
export interface Services {
  cfg: BrandConfig;
  vault: Vault;
  llm: LlmClient;
  transcriber: Transcriber;
  log: Logger;
  now: () => Date;
}
