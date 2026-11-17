/**
 * Vercel Function (Node runtime, kein Framework): Anmeldung über das Formular der Landing-Page.
 * Prüft die Eingaben und stößt bei Brevo das Double-Opt-in an. Den GitHub-Link gibt es erst
 * auf /welcome, wohin Brevo nach der Bestätigung weiterleitet.
 *
 * Umgebung (nur in Vercel gesetzt, nie im Repo): BREVO_API_KEY, BREVO_LIST_ID, BREVO_DOI_TEMPLATE_ID.
 * Fehlt etwas davon, antwortet die Funktion mit 503 (fail closed).
 * Es werden weder der Schlüssel noch E-Mail-Adressen oder Antworten geloggt.
 *
 * Ohne JavaScript: normales POST, Antwort ist eine Weiterleitung (303) auf /check-inbox oder /try-again.
 * Mit JavaScript (Accept: application/json): JSON { ok, message }.
 */
export const BREVO_URL = "https://api.brevo.com/v3/contacts/doubleOptinConfirmation";
export const REDIRECT_URL = "https://tasteloop.eu/welcome";
export const MAX_ANSWER = 500;
export const MESSAGES = {
  ok: "Check your inbox to confirm. The link comes right after.",
  email: "Please enter a valid email address.",
  answer: "Please answer the question in up to 500 characters.",
  unavailable: "Sign-up is not available right now. Please try again later.",
  busy: "Too many attempts. Please try again in a few minutes.",
  failed: "That didn't work. Please try again in a moment.",
  refused: "This request was not accepted.",
} as const;

type Env = Record<string, string | undefined>;
type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number }>;

/** Einfache Bremse pro Instanz: höchstens `max` Versuche je Schlüssel im Zeitfenster. Nichts wird gespeichert. */
const hits = new Map<string, number[]>();
export function rateLimited(key: string, now: number, max = 5, windowMs = 10 * 60_000): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  return false;
}
export function resetRateLimit(): void {
  hits.clear();
}

export function validEmail(s: string): boolean {
  return s.length <= 254 && /^[^\s@<>()[\],;:"\\]+@[^\s@<>()[\],;:"\\]+\.[a-z0-9-]{2,}$/i.test(s) && !s.includes("..");
}

function reply(request: Request, status: number, ok: boolean, message: string): Response {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if ((request.headers.get("accept") ?? "").includes("application/json")) {
    return new Response(JSON.stringify({ ok, message }), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
  }
  // Formular ohne JavaScript: auf eine statische Seite weiterleiten
  return new Response(null, { status: 303, headers: { ...headers, Location: ok ? "/check-inbox" : "/try-again" } });
}

async function fields(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get("content-type") ?? "";
  const out: Record<string, string> = {};
  if (type.includes("application/json")) {
    const data: unknown = await request.json();
    if (data && typeof data === "object") for (const [k, v] of Object.entries(data)) if (typeof v === "string" || typeof v === "boolean") out[k] = String(v);
    return out;
  }
  const form = await request.formData();
  for (const [k, v] of form.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

function sameSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function subscribe(request: Request, env: Env = process.env, fetchImpl: FetchLike = fetch, now: number = Date.now()): Promise<Response> {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });

  const key = env.BREVO_API_KEY;
  const listId = Number(env.BREVO_LIST_ID);
  const templateId = Number(env.BREVO_DOI_TEMPLATE_ID);
  if (!key || !Number.isInteger(listId) || listId <= 0 || !Number.isInteger(templateId) || templateId <= 0) {
    console.error("subscribe: Brevo is not configured");
    return reply(request, 503, false, MESSAGES.unavailable);
  }
  if (!sameSite(request)) return reply(request, 403, false, MESSAGES.refused);
  if (Number(request.headers.get("content-length") ?? 0) > 10_000) return reply(request, 413, false, MESSAGES.failed);

  let data: Record<string, string>;
  try {
    data = await fields(request);
  } catch {
    return reply(request, 400, false, MESSAGES.failed);
  }

  // Honigtopf: Bots füllen das versteckte Feld aus. Still „Erfolg“ melden, nichts senden.
  if ((data.website ?? "").trim() !== "") return reply(request, 200, true, MESSAGES.ok);

  const email = (data.email ?? "").trim().toLowerCase();
  const answer = (data.answer ?? "").trim();
  const updates = ["yes", "on", "true", "1"].includes((data.updates ?? "").toLowerCase());
  if (!validEmail(email)) return reply(request, 400, false, MESSAGES.email);
  if (answer.length === 0 || answer.length > MAX_ANSWER) return reply(request, 400, false, MESSAGES.answer);

  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip, now)) return reply(request, 429, false, MESSAGES.busy);

  try {
    const res = await fetchImpl(BREVO_URL, {
      method: "POST",
      headers: { "api-key": key, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        email,
        attributes: { TL_ANSWER: answer, TL_UPDATES: updates, TL_SOURCE: "landing" },
        includeListIds: [listId],
        templateId,
        redirectionUrl: REDIRECT_URL,
      }),
    });
    if (!res.ok) {
      console.error(`subscribe: Brevo responded with ${res.status}`);
      return reply(request, 502, false, MESSAGES.failed);
    }
  } catch {
    console.error("subscribe: Brevo could not be reached");
    return reply(request, 502, false, MESSAGES.failed);
  }
  return reply(request, 200, true, MESSAGES.ok);
}

export function POST(request: Request): Promise<Response> {
  return subscribe(request);
}

export function GET(): Response {
  return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
}
