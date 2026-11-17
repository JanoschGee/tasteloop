/**
 * Prüfung des Cloudflare-Access-JWT (Header Cf-Access-Jwt-Assertion).
 * Zweite Schicht hinter dem Tunnel: Die Galerie lauscht nur auf 127.0.0.1,
 * und zusätzlich muss jede Anfrage ein gültiges Access-Token tragen.
 */
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export interface AccessConfig {
  /** z. B. "team.cloudflareaccess.com" */
  teamDomain: string;
  /** Application Audience (AUD) Tag aus dem Access-Dashboard */
  audience: string;
  /** optional: nur diese E-Mails (zusätzlich zur Access-Policy) */
  allowedEmails?: string[];
}

export type AccessResult = { ok: true; email?: string } | { ok: false; reason: string };

const jwksCache = new Map<string, JWTVerifyGetKey>();

export function remoteJwks(teamDomain: string): JWTVerifyGetKey {
  let j = jwksCache.get(teamDomain);
  if (!j) {
    j = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    jwksCache.set(teamDomain, j);
  }
  return j;
}

export async function verifyAccessJwt(token: string | null | undefined, cfg: AccessConfig, keys: JWTVerifyGetKey = remoteJwks(cfg.teamDomain)): Promise<AccessResult> {
  if (!token) return { ok: false, reason: "kein Access-Token" };
  try {
    const { payload } = await jwtVerify(token, keys, { issuer: `https://${cfg.teamDomain}`, audience: cfg.audience });
    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : undefined;
    if (cfg.allowedEmails?.length && (!email || !cfg.allowedEmails.map((e) => e.toLowerCase()).includes(email))) {
      return { ok: false, reason: "E-Mail nicht zugelassen" };
    }
    return { ok: true, email };
  } catch (err) {
    return { ok: false, reason: `Token ungültig (${err instanceof Error ? err.name : "Fehler"})` };
  }
}

/** Liest die Access-Konfiguration aus der Umgebung. Fail closed: ohne Konfiguration nur, wenn ausdrücklich erlaubt. */
export function accessConfigFromEnv(env: Record<string, string | undefined>): { mode: "enforce"; cfg: AccessConfig } | { mode: "off" } | { mode: "misconfigured" } {
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN?.trim();
  const audience = env.CF_ACCESS_AUD?.trim();
  if (teamDomain && audience) {
    const allowedEmails = env.CF_ACCESS_EMAILS?.split(",").map((s) => s.trim()).filter(Boolean);
    return { mode: "enforce", cfg: { teamDomain, audience, allowedEmails } };
  }
  if (env.TASTELOOP_WEB_ACCESS_OFF === "1") return { mode: "off" };
  return { mode: "misconfigured" };
}
