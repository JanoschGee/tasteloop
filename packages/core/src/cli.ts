#!/usr/bin/env node
/**
 * Entry point for services and day-to-day use.
 *   tsx packages/core/src/cli.ts <command> --brand <config>
 * Commands: bot | digest | apply | init-vault | doctor | ids | sync-plan | migrate-en
 */
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadBrandConfig, loadSecrets, repoRootFrom, resolveBrandConfigPath, type BrandConfig, type Secrets } from "./config";
import { lockRules, readGuide } from "./guide/context";
import { missingLocks } from "./guide/sections";
import { applyChatText, runApply } from "./jobs/apply";
import { digestChatText, runDigest } from "./jobs/digest";
import { AnthropicLlm, type LlmClient } from "./llm/client";
import { consoleLogger } from "./log";
import { migrate } from "./migrate";
import type { Services } from "./services";
import { BotState, defaultDataDir } from "./state";
import { excludeCommand, outsideScope, planExcludes } from "./syncscope";
import { HttpTelegramApi } from "./telegram/api";
import { runPolling, TelegramHandler } from "./telegram/handler";
import { buildTranscriber } from "./transcribe/transcribe";
import { ensureVaultStructure } from "./vault/bases";
import { Vault } from "./vault/vault";

const log = consoleLogger;

function setup(argv: string[]) {
  const cfgPath = resolveBrandConfigPath(argv);
  const cfg = loadBrandConfig(cfgPath);
  const repoRoot = repoRootFrom(import.meta.url);
  const { secrets, warnings } = loadSecrets({ repoRoot, vaultRoot: cfg.vault.root });
  warnings.forEach((w) => log.warn(w));
  const vault = new Vault(cfg);
  const dataDir = defaultDataDir(cfg.brand.id);
  return { cfg, secrets, vault, dataDir, cfgPath };
}

function requireSecret(s: Secrets, k: keyof Secrets, name: string): string {
  const v = s[k];
  if (!v) throw new Error(`${name} is missing. Add it to ~/.config/tasteloop/.env (see .env.example).`);
  return v;
}

function services(cfg: BrandConfig, secrets: Secrets, vault: Vault, llm?: LlmClient): Services {
  return {
    cfg,
    vault,
    llm: llm ?? new AnthropicLlm(requireSecret(secrets, "anthropicApiKey", "ANTHROPIC_API_KEY")),
    transcriber: buildTranscriber(cfg, secrets, log),
    log,
    now: () => new Date(),
  };
}

async function cmdBot(argv: string[]) {
  const { cfg, secrets, vault, dataDir } = setup(argv);
  const token = requireSecret(secrets, "telegramBotToken", "TELEGRAM_BOT_TOKEN");
  const svc = services(cfg, secrets, vault);
  ensureVaultStructure(vault).forEach((p) => log.info("created", { p }));
  const tg = new HttpTelegramApi(token);
  const state = new BotState(join(dataDir, "state.json"));
  const handler = new TelegramHandler(svc, tg, state);
  const ac = new AbortController();
  for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => ac.abort());
  log.info("Bot started (long polling)", { brand: cfg.brand.id, chat: cfg.telegram.chat_id });
  await runPolling(handler, tg, state, svc, ac.signal);
  log.info("Bot stopped");
}

async function notify(cfg: BrandConfig, secrets: Secrets, text: string | undefined) {
  if (!text || !secrets.telegramBotToken) return;
  try {
    await new HttpTelegramApi(secrets.telegramBotToken).sendMessage(cfg.telegram.chat_id, text);
  } catch (err) {
    log.warn("Chat message not sent", { error: String(err) });
  }
}

async function cmdDigest(argv: string[]) {
  const { cfg, secrets, vault } = setup(argv);
  const svc = services(cfg, secrets, vault);
  ensureVaultStructure(vault);
  const r = await runDigest(svc);
  if (!argv.includes("--quiet")) await notify(cfg, secrets, digestChatText(svc, r));
  console.log(JSON.stringify(r, null, 2));
}

async function cmdApply(argv: string[]) {
  const { cfg, secrets, vault, dataDir } = setup(argv);
  // applying needs no LLM
  const svc: Services = {
    cfg,
    vault,
    llm: { structured: async () => { throw new Error("no LLM in the apply job"); } },
    transcriber: buildTranscriber(cfg, secrets, log),
    log,
    now: () => new Date(),
  };
  const results = runApply(svc, { backupDir: join(dataDir, "guide-backups") });
  if (!argv.includes("--quiet")) await notify(cfg, secrets, applyChatText(results));
  if (results.length) console.log(JSON.stringify(results, null, 2));
}

function cmdInitVault(argv: string[]) {
  const { vault } = setup(argv);
  const created = ensureVaultStructure(vault);
  console.log(created.length ? `Created:\n  ${created.join("\n  ")}` : "Everything is already there.");
}

function which(bin: string): boolean {
  try {
    execFileSync("/usr/bin/which", [bin], { stdio: "ignore" });
    return true;
  } catch {
    return existsSync(bin);
  }
}

function cmdDoctor(argv: string[]) {
  const { cfg, secrets, vault, dataDir, cfgPath } = setup(argv);
  let failed = 0;
  const ok = (b: boolean, msg: string) => {
    if (!b) failed++;
    console.log(`${b ? "✔" : "✘"} ${msg}`);
  };
  ok(true, `Config valid: ${cfgPath}`);
  ok(existsSync(join(vault.root, ".obsidian")), `Vault found: ${vault.root}`);
  let guide = "";
  try {
    guide = readGuide(vault);
    ok(true, `Brand guide found: ${vault.guidePath}`);
  } catch (e) {
    ok(false, e instanceof Error ? e.message : String(e));
  }
  if (guide) {
    const miss = missingLocks(guide, lockRules(vault));
    ok(miss.length === 0, miss.length ? `Locked or learning headings not found in the guide: ${miss.join(", ")}` : "All locked and learning headings found in the guide");
  }
  ok(!!secrets.telegramBotToken, "TELEGRAM_BOT_TOKEN is set");
  ok(!!secrets.anthropicApiKey, "ANTHROPIC_API_KEY is set");
  const t = cfg.transcription;
  if (t.local.enabled) {
    ok(which(t.local.binary), `whisper.cpp: ${t.local.binary}`);
    ok(existsSync(t.local.model), `Whisper model: ${t.local.model}`);
    ok(which(t.local.ffmpeg), `ffmpeg: ${t.local.ffmpeg}`);
  }
  if (cfg.vault.sync_only && existsSync(vault.root)) {
    const extra = outsideScope(vault.root, cfg.vault.sync_only, 50, cfg.vault.sync_allowed);
    ok(
      extra.length === 0,
      extra.length
        ? `Files outside "${cfg.vault.sync_only}" on this machine: ${extra.slice(0, 5).join(", ")}${extra.length > 5 ? " …" : ""}`
        : `Only "${cfg.vault.sync_only}" is in the vault${cfg.vault.sync_allowed.length ? ` (plus ${cfg.vault.sync_allowed.length} allowed files)` : ""}`,
    );
  }
  if (t.api.enabled) ok(t.api.provider === "elevenlabs" ? !!secrets.elevenlabsApiKey : !!secrets.openaiApiKey, `Fallback transcription (${t.api.provider}) has a key`);
  console.log(`  State: ${dataDir}`);
  if (failed) process.exitCode = 1;
}

/**
 * Shows chat and user IDs from the latest messages to the bot (for setup).
 * Does not confirm updates (no offset): the bot still sees them later.
 * Only use it while the bot service is not running.
 */
async function cmdIds(argv: string[]) {
  const cfgPath = argv.includes("--brand") ? resolveBrandConfigPath(argv) : undefined;
  const repoRoot = repoRootFrom(import.meta.url);
  const vaultRoot = cfgPath ? loadBrandConfig(cfgPath).vault.root : "/nonexistent";
  const { secrets } = loadSecrets({ repoRoot, vaultRoot });
  const token = requireSecret(secrets, "telegramBotToken", "TELEGRAM_BOT_TOKEN");
  const updates = await new HttpTelegramApi(token).getUpdates(0, 0);
  const seen = new Map<string, string>();
  for (const u of updates) {
    const m = u.message ?? u.callback_query?.message;
    if (m) seen.set(`chat ${m.chat.id}`, `${m.chat.type} ${m.chat.title ?? ""}`.trim());
    const from = u.message?.from ?? u.callback_query?.from;
    if (from) seen.set(`user ${from.id}`, from.first_name ?? from.username ?? "");
  }
  if (!seen.size) console.log("No messages found. Write something in the group and run this command again.");
  for (const [k, v] of seen) console.log(`${k}\t${v}`);
}

/**
 * Plans selective sync from a local vault (read-only):
 *   sync-plan --vault <local vault> --brand <config> [--target <path on host>] [--out <file>]
 *   sync-plan --vault <local vault> --keep <folder> [--allow a,b] ...
 * Exit code 3 if anything besides the allowed files would still be synced.
 */
function cmdSyncPlan(argv: string[]) {
  const arg = (k: string) => (argv.indexOf(k) >= 0 ? argv[argv.indexOf(k) + 1] : undefined);
  const cfg = argv.includes("--brand") ? loadBrandConfig(resolveBrandConfigPath(argv)) : undefined;
  const vaultPath = arg("--vault");
  const keep = arg("--keep") ?? cfg?.vault.sync_only;
  const allowed = arg("--allow")?.split(",").filter(Boolean) ?? cfg?.vault.sync_allowed ?? [];
  if (!vaultPath || !keep) throw new Error("Usage: sync-plan --vault <local vault> (--brand <config> | --keep <folder>) [--target <path>] [--out <file>]");
  const plan = planExcludes(vaultPath, keep, allowed);
  console.log(`Folders to exclude (${plan.excluded.length}):`);
  plan.excluded.forEach((x) => console.log(`  ${x}`));
  if (allowed.length) console.log(`\nAllowed files (${allowed.length}): ${allowed.join(", ")}`);
  console.log(`\nOther files that would still be synced (${plan.leaking.length}):`);
  plan.leaking.forEach((x) => console.log(`  ${x}`));
  console.log(`\nCommand on the host:\n  ${excludeCommand(arg("--target") ?? cfg?.vault.root ?? "<vault path>", plan.excluded)}`);
  const out = arg("--out");
  if (out) {
    writeFileSync(out, plan.excluded.join("\n") + "\n");
    console.log(`\nFolder list written: ${out}`);
  }
  if (plan.leaking.length) process.exitCode = 3;
}

/**
 * Converts an older German config and vault to English (dry run by default):
 *   migrate-en --brand <config> [--apply]
 */
function cmdMigrateEn(argv: string[]) {
  const cfgPath = resolveBrandConfigPath(argv);
  const apply = argv.includes("--apply");
  // backups go to the state folder; the brand id is read after conversion inside migrate()
  const backupRoot = join(defaultDataDir("migrate"), "..");
  const r = migrate({ configPath: cfgPath, apply, backupRoot });
  console.log(r.configChanged ? `Config: German keys -> English (${cfgPath})` : "Config: already English");
  console.log(`Notes and files to convert: ${r.files.length}`);
  for (const f of r.files) console.log(`  ${f.kind.padEnd(9)} ${f.path}`);
  console.log("The brand guide is never changed.");
  if (!apply) {
    console.log(r.configChanged || r.files.length ? "\nDry run. Nothing changed. Run again with --apply to convert (a backup is made first)." : "\nNothing to do.");
  } else if (r.applied) {
    console.log(`\nDone. Backup: ${r.backupDir}`);
  } else {
    console.log("\nNothing to do.");
  }
}

const [cmd, ...rest] = process.argv.slice(2);
const commands: Record<string, (a: string[]) => unknown> = {
  bot: cmdBot,
  digest: cmdDigest,
  apply: cmdApply,
  "init-vault": cmdInitVault,
  doctor: cmdDoctor,
  ids: cmdIds,
  "sync-plan": cmdSyncPlan,
  "migrate-en": cmdMigrateEn,
};
const fn = commands[cmd ?? ""];
if (!fn) {
  console.error(`Missing command. Available: ${Object.keys(commands).join(", ")}`);
  process.exit(2);
}
// also catches synchronous errors (e.g. an invalid config) and prints a clean message
Promise.resolve()
  .then(() => fn(rest))
  .catch((err) => {
    log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
