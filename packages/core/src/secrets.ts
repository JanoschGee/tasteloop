/**
 * Erkennung von Secrets. Wird an zwei Stellen benutzt:
 * 1. scripts/check-secrets.ts (Pre-Commit-Hook und Test): nichts Geheimes ins Repo.
 * 2. Vault-Schreiber: keine Notiz mit Secret-Muster landet im Vault.
 */
export interface SecretPattern {
  name: string;
  regex: RegExp;
}

export const SECRET_PATTERNS: SecretPattern[] = [
  { name: "Telegram-Bot-Token", regex: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/ },
  { name: "Anthropic-API-Key", regex: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: "OpenAI-API-Key", regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/ },
  { name: "ElevenLabs-API-Key", regex: /\bsk_[a-f0-9]{48}\b/ },
  { name: "Cloudflare-Tunnel-Token", regex: /\beyJhIjoi[A-Za-z0-9_=-]{40,}/ },
  { name: "Private Key", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "AWS-Access-Key", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "GitHub-Token", regex: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  {
    name: "Zugewiesenes Secret (KEY=wert)",
    regex: /\b(?:TELEGRAM_BOT_TOKEN|ANTHROPIC_API_KEY|OPENAI_API_KEY|ELEVENLABS_API_KEY|TUNNEL_TOKEN)\s*[=:]\s*["']?[A-Za-z0-9_:\-]{16,}/,
  },
];

/** Dateinamen, die nie eingecheckt werden dürfen (unabhängig vom Inhalt). */
export const FORBIDDEN_FILE_PATTERNS: RegExp[] = [
  /(^|\/)\.env$/,
  /(^|\/)\.env\.(?!example$)[^/]+$/,
  /\.pem$/,
  /\.p12$/,
  /(^|\/)id_(rsa|ed25519)$/,
  /(^|\/)cloudflared\/[^/]+\.json$/,
];

export interface SecretFinding {
  pattern: string;
  line: number;
}

export function findSecrets(text: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    for (const p of SECRET_PATTERNS) {
      if (p.regex.test(line)) findings.push({ pattern: p.name, line: i + 1 });
    }
  });
  return findings;
}

export function isForbiddenFile(path: string): boolean {
  return FORBIDDEN_FILE_PATTERNS.some((r) => r.test(path));
}

export class SecretLeakError extends Error {
  constructor(where: string, findings: SecretFinding[]) {
    super(
      `Secret-Muster gefunden in ${where}: ${findings
        .map((f) => `${f.pattern} (Zeile ${f.line})`)
        .join(", ")}. Schreiben abgebrochen.`,
    );
    this.name = "SecretLeakError";
  }
}

/** Wirft, wenn der Text wie ein Secret aussieht. */
export function assertNoSecrets(where: string, text: string): void {
  const findings = findSecrets(text);
  if (findings.length > 0) throw new SecretLeakError(where, findings);
}
