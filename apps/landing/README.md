# tasteloop.eu landing page

A static page (HTML, CSS, a little vanilla JavaScript), hosted on **Vercel**. No framework, no animation library, no cookies, no third-party resources in the browser. One sign-up form posts to a small Vercel Function on the same domain (see “Email gate”). Both fonts (Caveat for handwriting, Inter Tight for everything else, both OFL) and all images are served from the site itself. The wordmark, the pencil circles and the underlines are generated from `apps/web/lib/pencil.ts` at build time.

| Path | What |
|---|---|
| `src/index.html` | the page: hero, the hook ("An AI made this image in seconds."), the flow in four steps (Messenger → Classification → Brand memory → Agents), the system diagram with the tool stack, teams, the one loud section, promise, the sign-up form |
| `src/imprint.html`, `src/privacy.html` | legal pages |
| `src/welcome.html` | where the confirmation link lands: the GitHub link and the setup prompt (`noindex`) |
| `src/check-inbox.html`, `src/try-again.html` | answers for the form without JavaScript (`noindex`) |
| `api/subscribe.ts` | Vercel Function: validates the form and starts the Brevo double opt-in |
| `src/styles.css` | all styles and motion. The final state is the default state; hidden start states only apply under `.js` and without `prefers-reduced-motion` |
| `src/app.js` | sets `.js`, marks `.anim` blocks as `.in` when they scroll into view, highlights the current step in the rail, sends the form with `fetch`, copy button |
| `src/img/` | WebP images (generated in the brand style, then checked by hand), the paper grain tile and the marker underline |
| `build.ts` | builds into `dist/`: inlines the logo, replaces `{{CIRCLE:seed:w:h[:mod]}}`, `{{UNDERLINE:seed:w}}` and `{{WAVE:seed:n}}`, copies images and fonts |
| `vercel.json` | install and build commands, output directory, clean URLs, security headers (CSP, HSTS, Referrer-Policy, Permissions-Policy, X-Content-Type-Options, X-Frame-Options) |
| `test/` | checks the built page and `vercel.json`: content, the four steps, named contributors, images (alt, dimensions, lazy loading, weight), CSP compatibility (no inline script or style), reduced motion, the form and its labels, the function (Brevo mocked), no GitHub link outside `/welcome`, no third-party resources, headers, draft guard |

## Motion and the CSP

The CSP allows only `script-src 'self'` and `style-src 'self'`, so there are no inline styles or scripts: delays are classes (`.d1` to `.d9`), pencil strokes carry `pathLength="1"` and are drawn with `stroke-dashoffset`. The hero animates with plain CSS on load. Everything below is revealed by an `IntersectionObserver`; where the browser supports `animation-timeline`, a few details follow the scroll position. With `prefers-reduced-motion: reduce` or without JavaScript, everything is visible and nothing moves.

Brand rules for this page: red pencil is the one accent, blue, green and graphite only mark different people (always together with their name), and highlighter yellow appears only in the `.loud` section. No gradients.

## Email gate (Brevo)

The GitHub link is not on the public pages. Visitors enter their email and answer one question; Brevo sends a confirmation mail (double opt-in); the confirmation link leads to `/welcome`, which has the GitHub link and the setup prompt. The gate is soft: the repository itself is public.

How it works: the form posts to `/api/subscribe` (`api/subscribe.ts`). The function validates the input, ignores bots that fill the hidden field, limits attempts per IP address in memory, and calls Brevo's `POST /v3/contacts/doubleOptinConfirmation`. Without JavaScript the answer is a redirect to `/check-inbox` or `/try-again`; with JavaScript the message appears in place. The browser only ever talks to the own domain, so the CSP stays at `connect-src 'self'`; only `form-action` changed from `'none'` to `'self'`.

One-time setup in Brevo:

1. **Contact attributes** (Contacts → Settings → Contact attributes): `TL_ANSWER` (text), `TL_UPDATES` (boolean), `TL_SOURCE` (text).
2. **List:** create a list for the sign-ups and note its numeric ID.
3. **Double opt-in template:** create an email template tagged as a double opt-in template. It must contain the confirmation link `{{ doubleoptin }}` (as the button URL). Activate it and note its numeric ID. Keep the text short: "Confirm your email, the link to Tasteloop comes right after."
4. **Sender domain:** authenticate `tasteloop.eu` in Brevo (Senders, Domains & Dedicated IPs → Domains) and set the DNS records it shows: the Brevo code and **DKIM** records, and a **DMARC** record (`_dmarc.tasteloop.eu`). If the domain already has an SPF record for another mail service, keep a single SPF record. Without this the confirmation mails are likely to land in spam.
5. **Retention:** the privacy page promises that unconfirmed sign-ups are deleted after 30 days. Check how Brevo handles pending double opt-ins in your account and set up a matching clean-up.
6. **API key:** create a key (SMTP & API → API keys).

Environment variables in Vercel (Project → Settings → Environment Variables, **Production**; add Preview only if previews should send mail):

| Variable | Value |
|---|---|
| `BREVO_API_KEY` | the API key (never commit it) |
| `BREVO_LIST_ID` | numeric ID of the list |
| `BREVO_DOI_TEMPLATE_ID` | numeric ID of the double opt-in template |

If one of them is missing, the function answers 503 with a friendly message and sends nothing. The function never logs the key, email addresses or answers. The function is only deployed when the Vercel project's Root Directory is `apps/landing` (functions live in `<root>/api`).

After deploying, test once with your own address: submit the form, confirm the mail, land on `/welcome`.

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
