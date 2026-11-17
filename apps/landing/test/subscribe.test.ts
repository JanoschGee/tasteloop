/** Anmelde-Funktion: Prüfung der Eingaben, Honigtopf, Brevo-Aufruf (gemockt), nichts Geheimes in Antworten oder Logs. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BREVO_URL, GET, MESSAGES, rateLimited, REDIRECT_URL, resetRateLimit, subscribe, validEmail } from "../api/subscribe";

const KEY = "k-test-not-real";
const env = { BREVO_API_KEY: KEY, BREVO_LIST_ID: "7", BREVO_DOI_TEMPLATE_ID: "3" };
const mail = ["mara", "example.org"].join("@");
const brevoOk = () => vi.fn(async () => ({ ok: true, status: 201 }));

function post(fields: Record<string, string>, headers: Record<string, string> = {}): Request {
  return new Request("https://tasteloop.eu/api/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", ...headers },
    body: new URLSearchParams(fields).toString(),
  });
}
const good = { email: mail, answer: "We paste the guide into every prompt.", website: "" };

let logs: string[] = [];
beforeEach(() => {
  resetRateLimit();
  logs = [];
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void logs.push(a.join(" ")));
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void logs.push(a.join(" ")));
});
afterEach(() => vi.restoreAllMocks());

describe("subscribe", () => {
  it("ohne Konfiguration: 503 mit freundlicher Meldung, kein Aufruf nach außen", async () => {
    for (const broken of [{}, { ...env, BREVO_API_KEY: "" }, { ...env, BREVO_LIST_ID: "abc" }, { ...env, BREVO_DOI_TEMPLATE_ID: undefined }]) {
      const f = brevoOk();
      const res = await subscribe(post(good), broken, f);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ ok: false, message: MESSAGES.unavailable });
      expect(f).not.toHaveBeenCalled();
    }
  });

  it("ungültige E-Mail oder fehlende/zu lange Antwort: 400, kein Aufruf", async () => {
    const f = brevoOk();
    for (const email of ["", "nope", "a@b", "a b@example.org", "a@@example.org"]) {
      const res = await subscribe(post({ ...good, email }), env, f);
      expect(res.status, email).toBe(400);
      expect((await res.json()).message).toBe(MESSAGES.email);
    }
    for (const answer of ["", "   ", "x".repeat(501)]) {
      const res = await subscribe(post({ ...good, answer }), env, f);
      expect(res.status).toBe(400);
      expect((await res.json()).message).toBe(MESSAGES.answer);
    }
    expect(f).not.toHaveBeenCalled();
    expect(validEmail(mail)).toBe(true);
  });

  it("Honigtopf ausgefüllt: stilles 200, Brevo wird nicht aufgerufen", async () => {
    const f = brevoOk();
    const res = await subscribe(post({ ...good, website: "https://spam.example" }), env, f);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, message: MESSAGES.ok });
    expect(f).not.toHaveBeenCalled();
  });

  it("Erfolg: Brevo-Double-Opt-in mit dem richtigen Inhalt, Schlüssel nur im Header", async () => {
    const f = brevoOk();
    const res = await subscribe(post({ ...good, email: `  ${mail.toUpperCase()} `, updates: "yes" }), env, f);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ok: true, message: "Check your inbox to confirm. The link comes right after." });
    expect(text).not.toContain(KEY);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, { method: string; headers: Record<string, string>; body: string }];
    expect(url).toBe("https://api.brevo.com/v3/contacts/doubleOptinConfirmation");
    expect(url).toBe(BREVO_URL);
    expect(init.method).toBe("POST");
    expect(init.headers["api-key"]).toBe(KEY);
    expect(init.body).not.toContain(KEY);
    expect(JSON.parse(init.body)).toEqual({
      email: mail,
      attributes: { TL_ANSWER: good.answer, TL_UPDATES: true, TL_SOURCE: "landing" },
      includeListIds: [7],
      templateId: 3,
      redirectionUrl: "https://tasteloop.eu/welcome",
    });
    expect(REDIRECT_URL).toBe("https://tasteloop.eu/welcome");
  });

  it("Updates sind ohne Häkchen aus", async () => {
    const f = brevoOk();
    await subscribe(post(good), env, f);
    const [, init] = f.mock.calls[0] as unknown as [string, { body: string }];
    expect(JSON.parse(init.body).attributes.TL_UPDATES).toBe(false);
  });

  it("ohne JavaScript (kein JSON gewünscht): Weiterleitung auf die passende Seite", async () => {
    const ok = await subscribe(post(good, { Accept: "text/html" }), env, brevoOk());
    expect(ok.status).toBe(303);
    expect(ok.headers.get("location")).toBe("/check-inbox");
    const bad = await subscribe(post({ ...good, email: "nope" }, { Accept: "text/html" }), env, brevoOk());
    expect(bad.status).toBe(303);
    expect(bad.headers.get("location")).toBe("/try-again");
  });

  it("Brevo-Fehler oder Netzwerkfehler: 502, nichts Geheimes in Antwort oder Log", async () => {
    const down = vi.fn(async () => ({ ok: false, status: 401 }));
    const res = await subscribe(post(good), env, down);
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ok: false, message: MESSAGES.failed });
    const boom = vi.fn(async () => {
      throw new Error(`network down ${KEY}`);
    });
    const res2 = await subscribe(post(good), env, boom);
    expect(res2.status).toBe(502);
    const all = text + (await res2.text()) + logs.join("\n");
    expect(all).not.toContain(KEY);
    expect(all).not.toContain(mail);
    expect(all).not.toContain(good.answer);
    expect(logs.join("\n")).toContain("401");
  });

  it("fremde Herkunft wird abgelehnt, andere Methoden auch", async () => {
    const f = brevoOk();
    const res = await subscribe(post(good, { Origin: "https://evil.example" }), env, f);
    expect(res.status).toBe(403);
    const same = await subscribe(post(good, { Origin: "https://tasteloop.eu" }), env, f);
    expect(same.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(1);
    expect(GET().status).toBe(405);
    expect((await subscribe(new Request("https://tasteloop.eu/api/subscribe"), env, f)).status).toBe(405);
  });

  it("Bremse: nach fünf Versuchen von einer Adresse ist für das Zeitfenster Schluss", async () => {
    const f = brevoOk();
    const from = { "x-forwarded-for": "203.0.113.9, 10.0.0.1" };
    for (let i = 0; i < 5; i++) expect((await subscribe(post(good, from), env, f, 1000 + i)).status).toBe(200);
    const blocked = await subscribe(post(good, from), env, f, 2000);
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).message).toBe(MESSAGES.busy);
    expect((await subscribe(post(good, { "x-forwarded-for": "203.0.113.10" }), env, f, 2000)).status).toBe(200);
    expect((await subscribe(post(good, from), env, f, 2000 + 11 * 60_000)).status).toBe(200);
    expect(f).toHaveBeenCalledTimes(7);
    expect(rateLimited("x", 0, 1)).toBe(false);
    expect(rateLimited("x", 1, 1)).toBe(true);
  });

  it("JSON-Body geht auch", async () => {
    const f = brevoOk();
    const req = new Request("https://tasteloop.eu/api/subscribe", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ ...good, updates: true }) });
    expect((await subscribe(req, env, f)).status).toBe(200);
    const [, init] = f.mock.calls[0] as unknown as [string, { body: string }];
    expect(JSON.parse(init.body).attributes.TL_UPDATES).toBe(true);
  });
});
