/**
 * Brand configuration. Everything brand-specific lives in one YAML file per brand
 * (for example ~/.config/tasteloop/brands/<brand>.yaml). The code knows no brand.
 * Secrets NEVER go into the YAML (the schema is strict: unknown keys such as "token" are
 * rejected), only into the environment or a .env file outside the repo and the vault.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { findSecrets } from "./secrets";

export const LANGUAGES = ["en", "de"] as const;
export type Language = (typeof LANGUAGES)[number];

const Subfolders = z
  .object({
    uploads: z.string().default("Uploads"),
    images: z.string().default("Uploads/Images"),
    proposals: z.string().default("Proposals"),
    briefs: z.string().default("Briefs"),
    gallery: z.string().default("Gallery.base"),
    proposals_view: z.string().default("Proposals.base"),
    moodboard: z.string().default("Moodboard.canvas"),
    changelog: z.string().default("Changelog.md"),
  })
  .strict();

const LevelKeywords = z
  .object({
    brand: z.array(z.string()),
    campaign: z.array(z.string()),
    keep: z.array(z.string()),
  })
  .strict();

const DEFAULT_LOCAL = {
  enabled: true,
  binary: "whisper-cli",
  model: "~/.local/share/whisper/ggml-large-v3-turbo-q5_0.bin",
  ffmpeg: "ffmpeg",
  language: "en",
  timeout_seconds: 180,
};

export const BrandConfigSchema = z
  .object({
    brand: z
      .object({
        id: z.string().regex(/^[a-z0-9-]+$/, "only lowercase letters, digits and dashes"),
        name: z.string().min(1),
      })
      .strict(),
    /** Language of analyses, digests and briefs. The interface is always English. */
    language: z.enum(LANGUAGES).default("en"),
    /** Capture channels. Currently only Telegram. */
    channels: z.array(z.enum(["telegram"])).min(1).default(["telegram"]),
    telegram: z
      .object({
        chat_id: z.number().int(),
        /** Telegram user ID (as a string) -> display name. Same name = same person. */
        senders: z.record(z.string(), z.string()).default({}),
        known_senders_only: z.boolean().default(true),
        /** a voice note without reply is attached to the sender's last image within this many minutes */
        attach_minutes: z.number().int().positive().default(15),
      })
      .strict(),
    vault: z
      .object({
        /** absolute path of the vault root (the folder containing .obsidian) */
        root: z.string().min(1),
        /** Tasteloop's folder, relative to the vault root */
        folder: z.string().min(1),
        /** only this folder (vault-relative) should exist on the host; doctor checks it */
        sync_only: z.string().optional(),
        /** single files outside sync_only that are accepted on purpose (vault-relative) */
        sync_allowed: z.array(z.string()).default([]),
        subfolders: Subfolders.default(Subfolders.parse({})),
      })
      .strict(),
    guide: z
      .object({
        /** path relative to the vault root */
        file: z.string().min(1),
        /** extra locked headings (without #). Subsections inherit the lock. */
        locked: z.array(z.string()).default([]),
        /** frontmatter key in the guide that lists more locked headings */
        locked_key: z.string().default("locked"),
        /** title and intro (text before the first subheading) are locked */
        preamble_locked: z.boolean().default(true),
        /** only these sections (and subsections) learn. Empty = all unlocked sections. */
        learning: z.array(z.string()).default([]),
        /** lines containing these strings never change (for example base colour tokens) */
        locked_tokens: z.array(z.string()).default([]),
        /** section with the change log table; every applied change adds a row (optional) */
        changelog_section: z.string().optional(),
        /** frontmatter keys incremented / set to today on every applied change */
        version_key: z.string().default("version"),
        date_key: z.string().default("updated"),
        /** sections the image analysis reads (empty = whole guide) */
        analysis_context: z.array(z.string()).default([]),
        /** section with a table of prompt building blocks; briefs copy matching rows */
        brief_blocks: z.string().optional(),
        /** sections every brief appends word for word (for example a checklist) */
        brief_appendix: z.array(z.string()).default([]),
      })
      .strict(),
    /** who may approve proposals (property approved_by). Empty = anyone. */
    approvers: z.array(z.string()).default([]),
    models: z
      .object({
        analysis: z.string().default("claude-sonnet-5-5"),
        digest: z.string().default("claude-sonnet-5-5"),
        brief: z.string().default("claude-sonnet-5-5"),
      })
      .strict()
      .default({ analysis: "claude-sonnet-5-5", digest: "claude-sonnet-5-5", brief: "claude-sonnet-5-5" }),
    transcription: z
      .object({
        local: z
          .object({
            enabled: z.boolean().default(true),
            binary: z.string().default("whisper-cli"),
            model: z.string().default(DEFAULT_LOCAL.model),
            ffmpeg: z.string().default("ffmpeg"),
            language: z.string().default("en"),
            timeout_seconds: z.number().int().positive().default(180),
          })
          .strict()
          .default(DEFAULT_LOCAL),
        api: z
          .object({
            enabled: z.boolean().default(false),
            provider: z.enum(["elevenlabs", "openai"]).default("elevenlabs"),
            model: z.string().optional(),
          })
          .strict()
          .default({ enabled: false, provider: "elevenlabs" }),
      })
      .strict()
      .default({ local: DEFAULT_LOCAL, api: { enabled: false, provider: "elevenlabs" } }),
    /** also analyse "just keep" uploads (costs a little) */
    analyze_keep: z.boolean().default(false),
    level_keywords: LevelKeywords.optional(),
    web: z
      .object({
        /** public gallery URL, only used for links in chat messages */
        url: z.string().url().optional(),
      })
      .strict()
      .default({}),
  })
  .strict();

export type BrandConfig = z.infer<typeof BrandConfigSchema>;

export class ConfigError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ConfigError";
  }
}

export function expandHome(p: string): string {
  return p.startsWith("~/") ? join(homedir(), p.slice(2)) : p;
}

/** Keys of the old German config format; used to point people to migrate-en. */
const OLD_KEYS = ["marke", "brand_guide", "freigebende", "transkription", "modelle", "sprache"];

export function parseBrandConfig(yamlText: string, source = "Config"): BrandConfig {
  const findings = findSecrets(yamlText);
  if (findings.length) {
    throw new ConfigError(
      `${source} contains something that looks like a secret (${findings
        .map((f) => f.pattern)
        .join(", ")}). Secrets belong in the .env file, never in the brand config.`,
    );
  }
  const raw = parse(yamlText) as Record<string, unknown> | null;
  if (raw && OLD_KEYS.some((k) => k in raw)) {
    throw new ConfigError(`${source} uses the old German config format. Convert it with: npm run migrate-en -- --brand ${source}`);
  }
  const result = BrandConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    throw new ConfigError(`${source} is invalid:\n${issues}`);
  }
  const cfg = result.data;
  cfg.vault.root = expandHome(cfg.vault.root);
  if (!isAbsolute(cfg.vault.root)) {
    throw new ConfigError(`${source}: vault.root must be an absolute path`);
  }
  for (const rel of [cfg.vault.folder, cfg.guide.file]) {
    if (isAbsolute(rel) || rel.split(/[\\/]/).includes("..")) {
      throw new ConfigError(`${source}: path "${rel}" must be relative to the vault root and must not contain ".."`);
    }
  }
  cfg.transcription.local.model = expandHome(cfg.transcription.local.model);
  return cfg;
}

export function loadBrandConfig(path: string): BrandConfig {
  if (!existsSync(path)) throw new ConfigError(`Brand config not found: ${path}`);
  return parseBrandConfig(readFileSync(path, "utf8"), path);
}

/** Config path: argument --brand, otherwise TASTELOOP_BRAND_CONFIG. */
export function resolveBrandConfigPath(argv: string[], env = process.env): string {
  const i = argv.indexOf("--brand");
  const p = i >= 0 ? argv[i + 1] : env.TASTELOOP_BRAND_CONFIG;
  if (!p) throw new ConfigError("No brand given: use --brand <path to config> or set TASTELOOP_BRAND_CONFIG");
  return resolve(expandHome(p));
}

// ---------------------------------------------------------------------------
// Secrets from the environment
// ---------------------------------------------------------------------------

export interface Secrets {
  telegramBotToken?: string;
  anthropicApiKey?: string;
  elevenlabsApiKey?: string;
  openaiApiKey?: string;
}

export const DEFAULT_ENV_FILE = join(homedir(), ".config", "tasteloop", ".env");

function isInside(child: string, parent: string): boolean {
  const c = resolve(child);
  const p = resolve(parent);
  return c === p || c.startsWith(p + sep);
}

/** Reads KEY=value lines. No variable expansion, no multi-line values. */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(t);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

/**
 * Loads secrets: process environment first, then the .env file (TASTELOOP_ENV_FILE or the default path).
 * The .env file must not be inside the repo or the vault and should be chmod 600.
 */
export function loadSecrets(opts: { env?: NodeJS.ProcessEnv; repoRoot: string; vaultRoot: string }): { secrets: Secrets; warnings: string[] } {
  const env = opts.env ?? process.env;
  const warnings: string[] = [];
  const file = env.TASTELOOP_ENV_FILE ? resolve(expandHome(env.TASTELOOP_ENV_FILE)) : DEFAULT_ENV_FILE;
  let fromFile: Record<string, string> = {};
  if (existsSync(file)) {
    if (isInside(file, opts.repoRoot) || isInside(file, opts.vaultRoot)) {
      throw new ConfigError(`The secrets file ${file} is inside the repo or the vault. Move it to ${DEFAULT_ENV_FILE}.`);
    }
    const mode = statSync(file).mode & 0o777;
    if (mode & 0o077) warnings.push(`${file} is readable by others (mode ${mode.toString(8)}). Run: chmod 600 "${file}"`);
    fromFile = parseEnvFile(readFileSync(file, "utf8"));
  }
  const pick = (k: string) => env[k] || fromFile[k] || undefined;
  return {
    secrets: {
      telegramBotToken: pick("TELEGRAM_BOT_TOKEN"),
      anthropicApiKey: pick("ANTHROPIC_API_KEY"),
      elevenlabsApiKey: pick("ELEVENLABS_API_KEY"),
      openaiApiKey: pick("OPENAI_API_KEY"),
    },
    warnings,
  };
}

export function repoRootFrom(fileUrl: string): string {
  // packages/core/src/<file> -> repo root
  return resolve(dirname(new URL(fileUrl).pathname), "..", "..", "..");
}
