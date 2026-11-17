# Tasteloop

![tasteloop](apps/web/public/logo.svg)

[![License: MIT](https://img.shields.io/badge/License-MIT-111111.svg)](LICENSE)

**Taste can't be prompted.** AI gets you 80% there. Your team knows the rest.

Tasteloop collects your team's taste (every reference, every "why") and makes it readable for Claude and your agents.

## Who it is for

Marketing teams of two to twenty people who already work with Claude, ChatGPT or similar tools, and who are tired of on-brand-ish output. Tasteloop is free, open source and runs on your own machine. There is no hosted version yet.

## How it works

1. **Circle it.** Drop a screenshot into your team's Telegram group: an ad, a photo, a colour, a line of copy.
2. **Say why.** Add a caption or a voice note. Tap one of three buttons: *Brand*, *Campaign* or *Just keep*. Claude analyses the image together with your reason.
3. **Your agents get it.** Everything lands as Markdown notes with the image in your Obsidian vault. Every week, Tasteloop proposes changes to your brand guide. Each proposal comes with a diff, the evidence images and who backs it. A person approves, then the change is written into the guide. Campaign uploads turn into a brief right away.

What makes it a team tool:

- **Everyone adds.** A proposal shows how many different people support it: "3 people, 5 references".
- **Disagreements surface.** If one person praises what another criticises, both sides show up. Nothing contested quietly becomes a rule.
- **Single voices are kept, not hidden.** A proposal backed by only one person is marked as such.
- **Humans approve.** The core of your guide is locked. No job ever writes into it.

Your agents then read plain files: the guide, the references and the briefs. See [docs/agents.md](docs/agents.md).

## Quickstart (5 steps)

You need macOS or Linux, Node.js 22+, an [Obsidian](https://obsidian.md) vault, a Telegram account and an Anthropic API key. The easiest path is to let [Claude Code](https://claude.com/claude-code) guide you:

1. **Get the code.**
   ```bash
   git clone https://github.com/JanoschGee/tasteloop && cd tasteloop && npm install
   ```
2. **Start the guided setup.** In the repo, run `claude` and say **"set up tasteloop"**. The setup skill in `.claude/skills/tasteloop-setup/` checks your machine and walks you through every step. It never asks you to paste secrets into the chat.
3. **Create your bot and keys yourself.** In Telegram, create a bot with @BotFather, turn privacy mode off and add the bot to a group with your team. Put the bot token and your Anthropic key into `~/.config/tasteloop/.env` with your own editor.
4. **Write your config and guide.** Claude asks you a few questions and writes `~/.config/tasteloop/brands/<your-brand>.yaml`. If you don't have a brand guide yet, it starts one from [templates/brand-guide.md](templates/brand-guide.md).
5. **Run it.** `npm run doctor -- --brand <config>` must show only ✔. Then `npm run bot -- --brand <config>`, send a test image to the group and watch the note appear in Obsidian.

Prefer doing it by hand? Follow [docs/getting-started.md](docs/getting-started.md).

## Costs

| | Cost |
|---|---|
| Software | free (MIT) |
| Transcription | free, runs locally with whisper.cpp |
| Image analysis per upload | about $0.03 (Claude Sonnet) |
| Campaign brief | about $0.05 |
| Weekly digest | about $0.07 |

A team with 30 uploads a month pays roughly **$1–2 a month** in API costs. Details: [docs/costs.md](docs/costs.md).

## Limits (read before you start)

- **Self-hosted only.** The bot has to run somewhere: a laptop while it's open, a Mac mini or a small Linux server. See [docs/always-on.md](docs/always-on.md).
- **Telegram only** for capturing, for now.
- **The interface is German for now.** Bot messages, note headings, properties (`ebene`, `status: freigegeben`, …) and config keys are German. Every term is explained in English in the docs. An English interface is planned.
- **Obsidian** is the memory. The optional web gallery reads the same files.
- **No support.** Docs, the setup skill and the [FAQ](docs/faq.md) are all there is. Please don't expect help by email.

## Documentation

| Topic | |
|---|---|
| Getting started (by hand) | [docs/getting-started.md](docs/getting-started.md) |
| Configuration reference | [docs/configuration.md](docs/configuration.md) |
| Brand guide: core, expression, change log | [docs/brand-guide.md](docs/brand-guide.md) · [template](templates/brand-guide.md) |
| Capturing with Telegram | [docs/capturing.md](docs/capturing.md) |
| Weekly digest and approval | [docs/digest-and-approval.md](docs/digest-and-approval.md) |
| Campaign briefs | [docs/campaign-briefs.md](docs/campaign-briefs.md) |
| Agents reading your taste | [docs/agents.md](docs/agents.md) |
| Web gallery (optional) | [docs/gallery.md](docs/gallery.md) |
| Running always-on | [docs/always-on.md](docs/always-on.md) |
| Security and secrets | [docs/security.md](docs/security.md) |
| Costs | [docs/costs.md](docs/costs.md) |
| Troubleshooting | [docs/troubleshooting.md](docs/troubleshooting.md) |
| FAQ | [docs/faq.md](docs/faq.md) |

## For contributors

```bash
npm install
```

```bash
npm run verify
```

`verify` runs the secret check, the brand-neutrality check, type checks, all tests and both builds (gallery and landing page). The tests run without network access: Telegram and Claude are mocked. The repo layout:

| Path | What |
|---|---|
| `packages/core` | bot, transcription, Claude calls, vault notes, digest, approval, briefs (TypeScript) |
| `apps/web` | optional read-only gallery (Next.js) |
| `apps/landing` | static landing page for tasteloop.eu |
| `brands/example.yaml` | example config |
| `templates/brand-guide.md` | neutral brand guide template |
| `ops/` | launchd templates and an installer for a dedicated macOS machine |

## License

[MIT](LICENSE). Copyright (c) 2026 Tasteloop contributors.
