#!/usr/bin/env node
/**
 * Einstieg für launchd und Betrieb.
 *   tsx packages/core/src/cli.ts <befehl> --brand brands/<marke>.yaml
 * Befehle: bot | digest | apply | init-vault | doctor | ids | sync-plan
 */
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { loadBrandConfig, loadSecrets, repoRootFrom, resolveBrandConfigPath, type BrandConfig, type Secrets } from "./config";
import { missingLocks } from "./guide/sections";
import { lockRules, readGuide } from "./guide/context";
import { AnthropicLlm, type LlmClient } from "./llm/client";
import { consoleLogger } from "./log";
import type { Services } from "./services";
import { BotState, defaultDataDir } from "./state";
import { HttpTelegramApi } from "./telegram/api";
import { runPolling, TelegramHandler } from "./telegram/handler";
import { buildTranscriber } from "./transcribe/transcribe";
import { ensureVaultStructure } from "./vault/bases";
import { Vault } from "./vault/vault";
import { digestTelegramText, runDigest } from "./jobs/digest";
import { applyTelegramText, runApply } from "./jobs/apply";
import { excludeCommand, outsideScope, planExcludes } from "./syncscope";

const log = consoleLogger;

function setup(argv: string[]) {
  const cfgPath = resolveBrandConfigPath(argv);
  const cfg = loadBrandConfig(cfgPath);
  const repoRoot = repoRootFrom(import.meta.url);
  const { secrets, warnings } = loadSecrets({ repoRoot, vaultRoot: cfg.vault.wurzel });
  warnings.forEach((w) => log.warn(w));
  const vault = new Vault(cfg);
  const dataDir = defaultDataDir(cfg.marke.id);
  return { cfg, secrets, vault, dataDir, cfgPath };
}

function requireSecret(s: Secrets, k: keyof Secrets, name: string): string {
  const v = s[k];
  if (!v) throw new Error(`${name} fehlt. Bitte in ~/.config/tasteloop/.env eintragen (siehe .env.example).`);
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
  ensureVaultStructure(vault).forEach((p) => log.info("angelegt", { p }));
  const tg = new HttpTelegramApi(token);
  const state = new BotState(join(dataDir, "state.json"));
  const handler = new TelegramHandler(svc, tg, state);
  const ac = new AbortController();
  for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => ac.abort());
  log.info("Bot gestartet (Long Polling)", { marke: cfg.marke.id, chat: cfg.telegram.chat_id });
  await runPolling(handler, tg, state, svc, ac.signal);
  log.info("Bot beendet");
}

async function notify(cfg: BrandConfig, secrets: Secrets, text: string | undefined) {
  if (!text || !secrets.telegramBotToken) return;
  try {
    await new HttpTelegramApi(secrets.telegramBotToken).sendMessage(cfg.telegram.chat_id, text);
  } catch (err) {
    log.warn("Telegram-Hinweis nicht gesendet", { fehler: String(err) });
  }
}

async function cmdDigest(argv: string[]) {
  const { cfg, secrets, vault } = setup(argv);
  const svc = services(cfg, secrets, vault);
  ensureVaultStructure(vault);
  const r = await runDigest(svc);
  if (!argv.includes("--still")) await notify(cfg, secrets, digestTelegramText(svc, r));
  console.log(JSON.stringify(r, null, 2));
}

async function cmdApply(argv: string[]) {
  const { cfg, secrets, vault, dataDir } = setup(argv);
  // Übernahme braucht kein LLM
  const svc: Services = { cfg, vault, llm: { structured: async () => { throw new Error("kein LLM im Apply-Job"); } }, transcriber: buildTranscriber(cfg, secrets, log), log, now: () => new Date() };
  const results = runApply(svc, { backupDir: join(dataDir, "guide-backups") });
  if (!argv.includes("--still")) await notify(cfg, secrets, applyTelegramText(results));
  if (results.length) console.log(JSON.stringify(results, null, 2));
}

function cmdInitVault(argv: string[]) {
  const { vault } = setup(argv);
  const created = ensureVaultStructure(vault);
  console.log(created.length ? `Angelegt:\n  ${created.join("\n  ")}` : "Alles vorhanden.");
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
  ok(true, `Config gültig: ${cfgPath}`);
  ok(existsSync(join(vault.root, ".obsidian")), `Vault gefunden: ${vault.root}`);
  let guide = "";
  try {
    guide = readGuide(vault);
    ok(true, `Brand Guide gefunden: ${vault.guidePath}`);
  } catch (e) {
    ok(false, String(e));
  }
  if (guide) {
    const miss = missingLocks(guide, lockRules(vault));
    ok(miss.length === 0, miss.length ? `Gesperrte Abschnitte nicht im Guide gefunden: ${miss.join(", ")}` : `${cfg.brand_guide.gesperrte_abschnitte.length} gesperrte Abschnitte gefunden`);
  }
  ok(!!secrets.telegramBotToken, "TELEGRAM_BOT_TOKEN gesetzt");
  ok(!!secrets.anthropicApiKey, "ANTHROPIC_API_KEY gesetzt");
  const t = cfg.transkription;
  if (t.lokal.aktiv) {
    ok(which(t.lokal.binary), `whisper.cpp: ${t.lokal.binary}`);
    ok(existsSync(t.lokal.modell), `Whisper-Modell: ${t.lokal.modell}`);
    ok(which(t.lokal.ffmpeg), `ffmpeg: ${t.lokal.ffmpeg}`);
  }
  if (cfg.vault.sync_nur && existsSync(vault.root)) {
    const extra = outsideScope(vault.root, cfg.vault.sync_nur, 50, cfg.vault.sync_erlaubt);
    ok(extra.length === 0, extra.length ? `Außerhalb von „${cfg.vault.sync_nur}“ liegen Dateien auf diesem Rechner: ${extra.slice(0, 5).join(", ")}${extra.length > 5 ? " …" : ""}` : `Nur „${cfg.vault.sync_nur}“ liegt im Vault${cfg.vault.sync_erlaubt.length ? ` (plus ${cfg.vault.sync_erlaubt.length} erlaubte Dateien)` : ""}`);
  }
  if (t.api.aktiv) ok(t.api.anbieter === "elevenlabs" ? !!secrets.elevenlabsApiKey : !!secrets.openaiApiKey, `Fallback-Transkription (${t.api.anbieter}) hat Key`);
  console.log(`  Zustand: ${dataDir}`);
  if (failed) process.exitCode = 1;
}

/**
 * Zeigt Chat- und User-IDs aus den letzten Nachrichten an den Bot (für die Einrichtung).
 * Bestätigt keine Updates (kein offset), der Bot sieht sie später trotzdem.
 * Nur benutzen, solange der Bot-Dienst nicht läuft.
 */
async function cmdIds(argv: string[]) {
  const cfgPath = argv.includes("--brand") ? resolveBrandConfigPath(argv) : undefined;
  const repoRoot = repoRootFrom(import.meta.url);
  const vaultRoot = cfgPath ? loadBrandConfig(cfgPath).vault.wurzel : "/nonexistent";
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
  if (!seen.size) console.log("Keine Nachrichten gefunden. Schreib etwas in die Gruppe und starte den Befehl erneut.");
  for (const [k, v] of seen) console.log(`${k}\t${v}`);
}

/**
 * Plant den selektiven Sync aus einem lokalen Vault (nur lesend):
 *   sync-plan --vault <lokaler Vault> --brand brands/<marke>.yaml [--ziel <Pfad auf dem Host>] [--out <datei>]
 *   sync-plan --vault <lokaler Vault> --keep <Ordner> [--erlaubt a,b] ...
 * Exit 3, wenn außer den erlaubten Dateien noch etwas mitkäme.
 */
function cmdSyncPlan(argv: string[]) {
  const arg = (k: string) => (argv.indexOf(k) >= 0 ? argv[argv.indexOf(k) + 1] : undefined);
  const cfg = argv.includes("--brand") ? loadBrandConfig(resolveBrandConfigPath(argv)) : undefined;
  const vaultPath = arg("--vault");
  const keep = arg("--keep") ?? cfg?.vault.sync_nur;
  const erlaubt = arg("--erlaubt")?.split(",").filter(Boolean) ?? cfg?.vault.sync_erlaubt ?? [];
  if (!vaultPath || !keep) throw new Error("Aufruf: sync-plan --vault <lokaler Vault> (--brand <config> | --keep <Ordner>) [--ziel <Pfad>] [--out <datei>]");
  const plan = planExcludes(vaultPath, keep, erlaubt);
  console.log(`Auszuschließende Ordner (${plan.excluded.length}):`);
  plan.excluded.forEach((x) => console.log(`  ${x}`));
  if (erlaubt.length) console.log(`\nBewusst erlaubte Dateien (${erlaubt.length}): ${erlaubt.join(", ")}`);
  console.log(`\nWeitere Dateien, die trotzdem synchronisiert würden (${plan.leaking.length}):`);
  plan.leaking.forEach((x) => console.log(`  ${x}`));
  console.log(`\nBefehl auf dem Host:\n  ${excludeCommand(arg("--ziel") ?? cfg?.vault.wurzel ?? "<Vault-Pfad>", plan.excluded)}`);
  const out = arg("--out");
  if (out) {
    writeFileSync(out, plan.excluded.join("\n") + "\n");
    console.log(`\nOrdnerliste geschrieben: ${out}`);
  }
  if (plan.leaking.length) process.exitCode = 3;
}

const [cmd, ...rest] = process.argv.slice(2);
const commands: Record<string, (a: string[]) => unknown> = { bot: cmdBot, digest: cmdDigest, apply: cmdApply, "init-vault": cmdInitVault, doctor: cmdDoctor, ids: cmdIds, "sync-plan": cmdSyncPlan };
const fn = commands[cmd ?? ""];
if (!fn) {
  console.error(`Befehl fehlt. Möglich: ${Object.keys(commands).join(", ")}`);
  process.exit(2);
}
Promise.resolve(fn(rest)).catch((err) => {
  log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
