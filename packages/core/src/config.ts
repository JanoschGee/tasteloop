/**
 * Marken-Konfiguration. Alles Markenspezifische steht in brands/<marke>.yaml.
 * Der Code kennt keine Marke. Secrets stehen NIE in der YAML (Schema ist strikt,
 * unbekannte Schlüssel wie "token" führen zum Abbruch), sondern nur in der
 * Umgebung bzw. in einer .env-Datei außerhalb von Repo und Vault.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { findSecrets } from "./secrets";

const Ordner = z
  .object({
    uploads: z.string().default("Uploads"),
    bilder: z.string().default("Uploads/Bilder"),
    vorschlaege: z.string().default("Vorschläge"),
    briefings: z.string().default("Briefings"),
    galerie: z.string().default("Galerie.base"),
    vorschlaege_ansicht: z.string().default("Vorschläge.base"),
    moodboard: z.string().default("Moodboard.canvas"),
    aenderungslog: z.string().default("Änderungslog.md"),
  })
  .strict();

const EbenenStichworte = z
  .object({
    brand: z.array(z.string()),
    kampagne: z.array(z.string()),
    merken: z.array(z.string()),
  })
  .strict();

export const BrandConfigSchema = z
  .object({
    marke: z
      .object({
        id: z.string().regex(/^[a-z0-9-]+$/, "nur Kleinbuchstaben, Ziffern, Bindestrich"),
        name: z.string().min(1),
      })
      .strict(),
    sprache: z.enum(["de"]).default("de"),
    telegram: z
      .object({
        chat_id: z.number().int(),
        /** Telegram-User-ID (als String) -> Anzeigename im Vault */
        absender: z.record(z.string(), z.string()).default({}),
        nur_bekannte_absender: z.boolean().default(true),
        /** Sprachnachricht ohne Antwort-Bezug wird dem letzten Upload desselben Absenders zugeordnet, wenn jünger als X Minuten */
        zuordnung_minuten: z.number().int().positive().default(15),
      })
      .strict(),
    vault: z
      .object({
        /** Absoluter Pfad zur Vault-Wurzel (Ordner mit .obsidian) */
        wurzel: z.string().min(1),
        /** Ordner des Brand-Systems relativ zur Vault-Wurzel */
        ordner: z.string().min(1),
        /** Nur dieser Ordner (vault-relativ) soll auf dem Host liegen; doctor prüft das. */
        sync_nur: z.string().optional(),
        /** Einzelne Dateien außerhalb von sync_nur, die bewusst akzeptiert sind (vault-relativ) */
        sync_erlaubt: z.array(z.string()).default([]),
        unterordner: Ordner.default(Ordner.parse({})),
      })
      .strict(),
    brand_guide: z
      .object({
        /** Pfad relativ zur Vault-Wurzel */
        datei: z.string().min(1),
        /** Zusätzlich gesperrte Überschriften (ohne #). Unterabschnitte erben die Sperre. */
        gesperrte_abschnitte: z.array(z.string()).default([]),
        /** Frontmatter-Schlüssel im Guide, der weitere gesperrte Überschriften auflistet */
        frontmatter_sperre: z.string().default("gesperrt"),
        /** Text vor der ersten Unterüberschrift (Titel und Vorspann) ist gesperrt */
        praeambel_gesperrt: z.boolean().default(true),
        /** Nur diese Abschnitte (inkl. Unterabschnitte) lernen. Leer = alle nicht gesperrten. */
        lernbereich: z.array(z.string()).default([]),
        /** Zeilen mit diesen Zeichenfolgen ändert das System nie (z. B. Grundfarben-Tokens) */
        gesperrte_tokens: z.array(z.string()).default([]),
        /** Abschnitt mit der Tabelle, in die jede Übernahme eine Zeile schreibt (optional) */
        protokoll_abschnitt: z.string().optional(),
        /** Frontmatter-Schlüssel, die bei jeder Übernahme hochgezählt bzw. auf heute gesetzt werden */
        version_feld: z.string().default("version"),
        datum_feld: z.string().default("stand"),
        /** Abschnitte, die die Bildanalyse als Kontext bekommt (leer = ganzer Guide) */
        analyse_kontext: z.array(z.string()).default([]),
        /** Abschnitt mit einer Tabelle von Prompt-Bausteinen; das Briefing wählt passende Zeilen */
        briefing_bausteine: z.string().optional(),
        /** Abschnitte, die jedes Briefing wörtlich anhängt (z. B. Prüfliste) */
        briefing_anhaenge: z.array(z.string()).default([]),
      })
      .strict(),
    /** Wer Vorschläge freigeben darf (Property freigegeben_von). Leer = jeder. */
    freigebende: z.array(z.string()).default([]),
    modelle: z
      .object({
        analyse: z.string().default("claude-sonnet-5-5"),
        digest: z.string().default("claude-sonnet-5-5"),
        briefing: z.string().default("claude-sonnet-5-5"),
      })
      .strict()
      .default({ analyse: "claude-sonnet-5-5", digest: "claude-sonnet-5-5", briefing: "claude-sonnet-5-5" }),
    transkription: z
      .object({
        lokal: z
          .object({
            aktiv: z.boolean().default(true),
            binary: z.string().default("whisper-cli"),
            modell: z.string().default("~/.local/share/whisper/ggml-large-v3-turbo-q5_0.bin"),
            ffmpeg: z.string().default("ffmpeg"),
            sprache: z.string().default("de"),
            timeout_sekunden: z.number().int().positive().default(180),
          })
          .strict()
          .default({
            aktiv: true,
            binary: "whisper-cli",
            modell: "~/.local/share/whisper/ggml-large-v3-turbo-q5_0.bin",
            ffmpeg: "ffmpeg",
            sprache: "de",
            timeout_sekunden: 180,
          }),
        api: z
          .object({
            aktiv: z.boolean().default(true),
            anbieter: z.enum(["elevenlabs", "openai"]).default("elevenlabs"),
            modell: z.string().optional(),
          })
          .strict()
          .default({ aktiv: true, anbieter: "elevenlabs" }),
      })
      .strict()
      .default({
        lokal: {
          aktiv: true,
          binary: "whisper-cli",
          modell: "~/.local/share/whisper/ggml-large-v3-turbo-q5_0.bin",
          ffmpeg: "ffmpeg",
          sprache: "de",
          timeout_sekunden: 180,
        },
        api: { aktiv: true, anbieter: "elevenlabs" },
      }),
    analyse_bei_merken: z.boolean().default(false),
    ebenen_stichworte: EbenenStichworte.optional(),
    web: z
      .object({
        /** Öffentliche URL hinter Cloudflare Access, nur für Links in Telegram-Nachrichten */
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

export function parseBrandConfig(yamlText: string, source = "Config"): BrandConfig {
  const findings = findSecrets(yamlText);
  if (findings.length) {
    throw new ConfigError(
      `${source} enthält etwas, das wie ein Secret aussieht (${findings
        .map((f) => f.pattern)
        .join(", ")}). Secrets gehören in die .env-Datei, nie in die Marken-Config.`,
    );
  }
  const raw = parse(yamlText);
  const result = BrandConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(Wurzel)"}: ${i.message}`)
      .join("\n");
    throw new ConfigError(`${source} ist ungültig:\n${issues}`);
  }
  const cfg = result.data;
  cfg.vault.wurzel = expandHome(cfg.vault.wurzel);
  if (!isAbsolute(cfg.vault.wurzel)) {
    throw new ConfigError(`${source}: vault.wurzel muss ein absoluter Pfad sein`);
  }
  for (const rel of [cfg.vault.ordner, cfg.brand_guide.datei]) {
    if (isAbsolute(rel) || rel.split(/[\\/]/).includes("..")) {
      throw new ConfigError(`${source}: Pfad "${rel}" muss relativ zur Vault-Wurzel sein und darf kein ".." enthalten`);
    }
  }
  cfg.transkription.lokal.modell = expandHome(cfg.transkription.lokal.modell);
  return cfg;
}

export function loadBrandConfig(path: string): BrandConfig {
  if (!existsSync(path)) throw new ConfigError(`Marken-Config nicht gefunden: ${path}`);
  return parseBrandConfig(readFileSync(path, "utf8"), path);
}

/** Pfad der Marken-Config: Argument --brand, sonst TASTELOOP_BRAND_CONFIG. */
export function resolveBrandConfigPath(argv: string[], env = process.env): string {
  const i = argv.indexOf("--brand");
  const p = i >= 0 ? argv[i + 1] : env.TASTELOOP_BRAND_CONFIG;
  if (!p) throw new ConfigError("Keine Marke angegeben: --brand brands/<marke>.yaml oder TASTELOOP_BRAND_CONFIG setzen");
  return resolve(p);
}

// ---------------------------------------------------------------------------
// Secrets aus der Umgebung
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

/** Liest KEY=wert-Zeilen. Keine Variablen-Expansion, keine Mehrzeiler. */
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
 * Lädt Secrets: zuerst Prozess-Umgebung, dann .env-Datei (TASTELOOP_ENV_FILE oder Standardpfad).
 * Die .env-Datei darf nicht im Repo und nicht im Vault liegen und muss chmod 600 haben.
 */
export function loadSecrets(opts: {
  env?: NodeJS.ProcessEnv;
  repoRoot: string;
  vaultRoot: string;
}): { secrets: Secrets; warnings: string[] } {
  const env = opts.env ?? process.env;
  const warnings: string[] = [];
  const file = env.TASTELOOP_ENV_FILE ? resolve(expandHome(env.TASTELOOP_ENV_FILE)) : DEFAULT_ENV_FILE;
  let fromFile: Record<string, string> = {};
  if (existsSync(file)) {
    if (isInside(file, opts.repoRoot) || isInside(file, opts.vaultRoot)) {
      throw new ConfigError(
        `Die Secret-Datei ${file} liegt im Repo oder im Vault. Bitte nach ${DEFAULT_ENV_FILE} verschieben.`,
      );
    }
    const mode = statSync(file).mode & 0o777;
    if (mode & 0o077) warnings.push(`${file} ist für andere lesbar (Modus ${mode.toString(8)}). Bitte: chmod 600 "${file}"`);
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
  // packages/core/src/<datei> -> Repo-Wurzel
  return resolve(dirname(new URL(fileUrl).pathname), "..", "..", "..");
}
