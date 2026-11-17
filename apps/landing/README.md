# tasteloop.eu landing page

A static page (HTML, CSS, a little vanilla JavaScript), hosted on **Vercel**. No framework, no animation library, no forms, no cookies, no third-party resources. Both fonts (Caveat for handwriting, Inter Tight for everything else, both OFL) and all images are served from the site itself. The wordmark, the pencil circles and the underlines are generated from `apps/web/lib/pencil.ts` at build time.

| Path | What |
|---|---|
| `src/index.html` | the page: hero, the hook ("An AI made this ad in seconds."), the flow in four steps (Messenger → Classification → Brand memory → Agents), teams, the one loud section, promise, get it |
| `src/imprint.html`, `src/privacy.html` | legal pages |
| `src/styles.css` | all styles and motion. The final state is the default state; hidden start states only apply under `.js` and without `prefers-reduced-motion` |
| `src/app.js` | sets `.js`, marks `.anim` blocks as `.in` when they scroll into view, highlights the current step in the rail, copy button |
| `src/img/` | WebP images (generated in the brand style, then checked by hand), the paper grain tile and the marker underline |
| `build.ts` | builds into `dist/`: inlines the logo, replaces `{{CIRCLE:seed:w:h[:mod]}}`, `{{UNDERLINE:seed:w}}` and `{{WAVE:seed:n}}`, copies images and fonts |
| `vercel.json` | install and build commands, output directory, clean URLs, security headers (CSP, HSTS, Referrer-Policy, Permissions-Policy, X-Content-Type-Options, X-Frame-Options) |
| `test/` | checks the built page and `vercel.json`: content, the four steps, named contributors, images (alt, dimensions, lazy loading, weight), CSP compatibility (no inline script or style), reduced motion, no forms or third-party resources, headers, draft guard |

## Motion and the CSP

The CSP allows only `script-src 'self'` and `style-src 'self'`, so there are no inline styles or scripts: delays are classes (`.d1` to `.d9`), pencil strokes carry `pathLength="1"` and are drawn with `stroke-dashoffset`. The hero animates with plain CSS on load. Everything below is revealed by an `IntersectionObserver`; where the browser supports `animation-timeline`, a few details follow the scroll position. With `prefers-reduced-motion: reduce` or without JavaScript, everything is visible and nothing moves.

Brand rules for this page: red pencil is the one accent, blue, green and graphite only mark different people (always together with their name), and highlighter yellow appears only in the `.loud` section. No gradients.

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
