import { describe, expect, it } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { accessConfigFromEnv, verifyAccessJwt } from "../src/access";

const cfg = { teamDomain: "team.cloudflareaccess.com", audience: "aud-123", allowedEmails: ["alex@example.com"] };

async function keys() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
  const sign = (claims: Record<string, unknown>, opts: { iss?: string; aud?: string; exp?: string } = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(opts.iss ?? "https://team.cloudflareaccess.com")
      .setAudience(opts.aud ?? "aud-123")
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? "5m")
      .sign(privateKey);
  return { jwks: createLocalJWKSet({ keys: [jwk] }), sign };
}

describe("Cloudflare Access", () => {
  it("akzeptiert ein gültiges Token einer zugelassenen E-Mail", async () => {
    const { jwks, sign } = await keys();
    expect(await verifyAccessJwt(await sign({ email: "alex@example.com" }), cfg, jwks)).toEqual({ ok: true, email: "alex@example.com" });
  });
  it("lehnt fehlendes, fremdes, abgelaufenes oder falsch adressiertes Token ab", async () => {
    const { jwks, sign } = await keys();
    expect((await verifyAccessJwt(undefined, cfg, jwks)).ok).toBe(false);
    expect((await verifyAccessJwt(await sign({ email: "fremd@example.com" }), cfg, jwks)).ok).toBe(false);
    expect((await verifyAccessJwt(await sign({ email: "alex@example.com" }, { aud: "andere" }), cfg, jwks)).ok).toBe(false);
    expect((await verifyAccessJwt(await sign({ email: "alex@example.com" }, { iss: "https://evil.example" }), cfg, jwks)).ok).toBe(false);
    expect((await verifyAccessJwt(await sign({ email: "alex@example.com" }, { exp: "-1m" }), cfg, jwks)).ok).toBe(false);
    const other = await keys();
    expect((await verifyAccessJwt(await other.sign({ email: "alex@example.com" }), cfg, jwks)).ok).toBe(false);
  });
  it("ist ohne Konfiguration geschlossen", () => {
    expect(accessConfigFromEnv({}).mode).toBe("misconfigured");
    expect(accessConfigFromEnv({ TASTELOOP_WEB_ACCESS_OFF: "1" }).mode).toBe("off");
    expect(accessConfigFromEnv({ CF_ACCESS_TEAM_DOMAIN: "t", CF_ACCESS_AUD: "a", CF_ACCESS_EMAILS: "a@x, b@y" })).toEqual({
      mode: "enforce",
      cfg: { teamDomain: "t", audience: "a", allowedEmails: ["a@x", "b@y"] },
    });
  });
});
