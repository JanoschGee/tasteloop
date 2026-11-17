# tasteloop.eu landing page

A static page (HTML, CSS, a few lines of JavaScript), hosted on **Vercel**. No framework, no forms, no cookies, no third-party resources. The handwriting font (Caveat, OFL) is served from the site itself. The wordmark and the pencil circles are generated from `apps/web/lib/pencil.ts` at build time.

| Path | What |
|---|---|
| `src/` | `index.html`, `imprint.html` and `privacy.html` (both **drafts** until reviewed), `styles.css`, `app.js` (copy button) |
| `build.ts` | builds into `dist/`: inlines logo and circles, copies the font |
| `vercel.json` | install and build commands, output directory, clean URLs, security headers (CSP, HSTS, Referrer-Policy, Permissions-Policy, X-Content-Type-Options, X-Frame-Options) |
| `test/` | checks the built page and `vercel.json`: content, accessibility basics, no forms or third-party resources, headers, draft guard |

## Build locally

```bash
npx tsx apps/landing/build.ts
```

Options:
- `--live` refuses to build while a page is marked as a draft (`data-draft="true"`) or still contains `[TODO`. On Vercel this applies to **production** only. Preview deployments build as drafts, and draft pages carry `noindex`.
- `--analytics` adds Vercel Web Analytics, which is cookieless and served from the same domain, so the CSP needs no change. It is off by default. Also enable Web Analytics in the Vercel project, and extend the privacy page first.
- `--repo-url=…` overrides the GitHub link (default: `https://github.com/JanoschGee/tasteloop`).

## Deploy on Vercel

1. Import the GitHub repository in Vercel.
2. Set **Root Directory** to `apps/landing`. Keep "Include files outside the root directory in the Build Step" enabled: the build uses the logo and the font from the rest of the repo.
3. Framework preset: **Other**. Install command, build command and output directory come from `vercel.json`.
4. Deploy. Production builds use `--live` and fail until the legal pages are final; previews work right away.
5. Add the domain under Project → Settings → Domains and set the DNS records Vercel shows.

## Tests

```bash
npx vitest run apps/landing
```
