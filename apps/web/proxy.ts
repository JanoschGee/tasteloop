/**
 * Zugriffsschutz: Jede Anfrage braucht ein gültiges Cloudflare-Access-Token.
 * Ohne Konfiguration (CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD) ist die Galerie geschlossen,
 * außer TASTELOOP_WEB_ACCESS_OFF=1 ist ausdrücklich gesetzt (nur für lokale Tests).
 */
import { NextResponse, type NextRequest } from "next/server";
import { accessConfigFromEnv, verifyAccessJwt } from "@tasteloop/core/access";

export async function proxy(req: NextRequest) {
  const access = accessConfigFromEnv(process.env);
  if (access.mode === "off") return NextResponse.next();
  if (access.mode === "misconfigured") {
    return new NextResponse("Zugriffsschutz nicht konfiguriert (CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD).", { status: 503 });
  }
  const token = req.headers.get("cf-access-jwt-assertion") ?? req.cookies.get("CF_Authorization")?.value;
  const result = await verifyAccessJwt(token, access.cfg);
  if (!result.ok) return new NextResponse("Kein Zugriff.", { status: 403 });
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
