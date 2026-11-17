# Web gallery (optional)

Obsidian is the main interface. The gallery is for people who don't use Obsidian. It is read-only: you can look, but not upload or approve. It shows:
- all uploads, filterable by level and status
- the brand guide, with locked sections marked
- proposals with their diff and support
- campaign briefs

References that made it into the guide and approved proposals are circled in red pencil.

It is a small Next.js app in `apps/web` that reads the vault directly.

## Run it on your machine

```bash
npm run build:web
```

```bash
TASTELOOP_BRAND_CONFIG=~/.config/tasteloop/brands/your-brand.yaml TASTELOOP_WEB_ACCESS_OFF=1 npm run start -w apps/web
```

It listens on `127.0.0.1:3042` only. `TASTELOOP_WEB_ACCESS_OFF=1` switches off the login check. Use it only when the gallery is not reachable from outside.

## Share it with your team

Never expose the port directly. A setup that works without opening your router:

1. **Cloudflare Tunnel** (`cloudflared`) to `http://127.0.0.1:3042`.
2. **Cloudflare Access** in front of it: a self-hosted application with your team's email addresses and a one-time PIN login (free for small teams).
3. Start the gallery with the Access details instead of `TASTELOOP_WEB_ACCESS_OFF`:

```bash
CF_ACCESS_TEAM_DOMAIN=<team>.cloudflareaccess.com CF_ACCESS_AUD=<aud tag> CF_ACCESS_EMAILS=alex@example.com,sam@example.com TASTELOOP_BRAND_CONFIG=<config> npm run start -w apps/web
```

The app then checks every request's Access token itself (signature, issuer, audience, email list). Without these variables and without `TASTELOOP_WEB_ACCESS_OFF=1` it answers 503: closed by default.

The macOS installer in `ops/` sets up gallery, tunnel and Access variables as services, see [always-on.md](always-on.md).
