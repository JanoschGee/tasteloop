---
name: tasteloop-setup
description: Guided setup of Tasteloop (self-hosted brand memory with a Telegram bot, Obsidian and Claude). Use when the user says "set up tasteloop", "install tasteloop", "configure tasteloop" or asks how to get Tasteloop running. Walks through prerequisites, bot, secrets, config, brand guide, vault, doctor, first test upload and always-on.
---

# Set up Tasteloop

You guide the user from a fresh clone to a working Tasteloop: a Telegram group where the team posts references, notes in their Obsidian vault, and a weekly digest. Work step by step. After each step, say what was done and what comes next. The user can stop at any step and continue later.

## Rules (read first, follow always)

- **Never ask for, accept or repeat secrets in the chat.** That covers the bot token, API keys and passwords. If the user pastes one anyway, tell them to revoke it (BotFather `/revoke`, Anthropic console) and create a new one.
- Secrets go into `~/.config/tasteloop/.env`, which the user fills in **with their own editor**. You may create the file from `.env.example` and set mode `600`, but you never write a secret into it.
- The user creates the bot (BotFather) and the API keys themselves. You explain how.
- Don't install system software without asking. Show the command, explain it, and run it only after a yes.
- Don't start services that run permanently (launchd, systemd, cron) without asking.
- Use the repo's commands (`npm run doctor`, `npm run ids`, `npm run init-vault`, `npm run bot`, …). Don't reimplement them.
- The bot's interface and note properties are German. Explain terms when they come up: `ebene` = level, `Kampagne` = campaign, `Nur merken` = just keep, `freigegeben` = approved, `Vorschläge` = proposals.
- Platform: macOS first. On Linux, use the package manager equivalents and the systemd example in `docs/always-on.md`. On Windows, recommend WSL2 and say it is untested.

## Step 1: Check prerequisites

Run these and report what's missing:

```bash
node -v && npm -v && (ffmpeg -version | head -1) && (command -v whisper-cli || echo "whisper-cli missing") && ls ~/.local/share/whisper/ 2>/dev/null
```

- Node.js must be 22 or newer. Missing pieces on macOS: `brew install node@22 ffmpeg whisper-cpp`. On Debian/Ubuntu: `sudo apt install ffmpeg`, plus Node 22 via nodesource or nvm; whisper.cpp is built from source.
- Whisper model (about 550 MB), after asking:
  `mkdir -p ~/.local/share/whisper && curl -fL -o ~/.local/share/whisper/ggml-large-v3-turbo-q5_0.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin`
- If the user doesn't want whisper.cpp, they can use an API fallback later (ElevenLabs or OpenAI key in `.env`, `transkription.lokal.aktiv: false`, `transkription.api.aktiv: true`).
- Run `npm install` in the repo if `node_modules` is missing.

Ask: Where is your Obsidian vault? It's the folder that contains `.obsidian`. Check that it exists.

## Step 2: Telegram bot and group (the user does this)

Explain, then wait until the user confirms:

1. In Telegram, open **@BotFather**, send `/newbot`, choose a name. BotFather shows a token **once**. Keep it for step 3; don't paste it here.
2. Send `/setprivacy` to @BotFather, choose the bot, select **Disable**. Otherwise the bot can't see images in groups.
3. Create a group with your team and add the bot.

## Step 3: Secrets file

Create the file and open it for the user. Don't fill it in:

```bash
mkdir -p ~/.config/tasteloop && [ -f ~/.config/tasteloop/.env ] || cp .env.example ~/.config/tasteloop/.env; chmod 600 ~/.config/tasteloop/.env
```

On macOS, offer `open -e ~/.config/tasteloop/.env`; on Linux, their editor. The user enters `TELEGRAM_BOT_TOKEN` and `ANTHROPIC_API_KEY`. Recommend a dedicated Anthropic key with a spending limit. Wait for "done". You can check that the keys are set without reading them:

```bash
grep -cE '^(TELEGRAM_BOT_TOKEN|ANTHROPIC_API_KEY)=.+' ~/.config/tasteloop/.env
```

It should print `2`. Never print the file.

## Step 4: Config from a few questions

Ask, one short message with all questions:

1. Brand name, for example "Acme". Derive the id: lowercase, dashes.
2. Vault path (from step 1).
3. Folder for the brand inside the vault (default `Brand`). Tasteloop writes into `<folder>/Tasteloop`.
4. Do you already have a brand guide in the vault? If yes, its path, and which headings are the locked core and which may learn. If no, we start from the template.
5. Who will post references, and who may approve changes? First names are enough.
6. Spoken language of voice notes (`en`, `de`, …).

Then:

1. Copy `brands/example.yaml` to `~/.config/tasteloop/brands/<id>.yaml` and fill in `marke`, `vault.wurzel`, `vault.ordner` (`<folder>/Tasteloop`), `brand_guide.datei`, `freigebende` and `transkription.lokal.sprache`. On macOS with Homebrew, set the binaries to `/opt/homebrew/bin/whisper-cli` and `/opt/homebrew/bin/ffmpeg`.
2. If the user has their own guide, set `frontmatter_sperre`, `lernbereich` and `protokoll_abschnitt` to match their headings. Offer to add a `locked: [...]` frontmatter and a change log section to their guide, after showing the diff and getting a yes. Explain the model briefly: Core locked, Expression learns, every change logged (see `docs/brand-guide.md`).
3. Get the Telegram IDs. Ask everyone to write one message in the group, then run:
   ```bash
   npm run ids -- --brand ~/.config/tasteloop/brands/<id>.yaml
   ```
   Put the negative chat ID into `telegram.chat_id` and map each user ID to the names from question 5 in `telegram.absender`. Show the user the final config (it contains no secrets).

## Step 5: Brand guide and vault folder

If there's no guide yet:

```bash
mkdir -p "<vault>/<folder>" && cp templates/brand-guide.md "<vault>/<folder>/Brand Guide.md"
```

Replace "Your Brand" with the brand name. Offer to help fill in Part 1 (purpose, audience, never) from a short conversation. Keep Part 2 placeholders; the team's references will fill them. The template's gallery embed (`Tasteloop/Galerie.base`) matches `vault.ordner = <folder>/Tasteloop`.

Then create gallery, moodboard and change log:

```bash
npm run init-vault -- --brand ~/.config/tasteloop/brands/<id>.yaml
```

## Step 6: Doctor

```bash
npm run doctor -- --brand ~/.config/tasteloop/brands/<id>.yaml
```

Every line must show ✔. Fix what doesn't, using `docs/troubleshooting.md`, and run it again.

## Step 7: First test upload

Start the bot in the foreground:

```bash
npm run bot -- --brand ~/.config/tasteloop/brands/<id>.yaml
```

Ask the user to send an image with a caption ("why: …") to the group and tap **Brand**. Within a minute:
- the bot replies with a short analysis
- a note appears in `<folder>/Tasteloop/Uploads/` with the image, the reason and the analysis
- the image shows up in `Galerie.base` in Obsidian

Optionally test a voice note as a reply to the image, and `/delete` as a reply. Stop the bot with Ctrl+C. If something fails, read the bot output and `docs/troubleshooting.md`.

## Step 8: Always on

Explain the three options from `docs/always-on.md` and ask which one fits:

- **Laptop:** bot in a terminal tab. Offer to add the two cron lines (approval every 10 minutes, digest Monday 08:00) with the user's absolute paths, after showing them.
- **Dedicated Mac:** `ops/install-macmini.sh`, a dry run first (no `--apply`). Walk through its output. It needs sudo, so the user runs the `--apply` steps themselves in their terminal.
- **Linux server:** adapt the systemd example and show the files before writing them.

## Step 9: Wrap up

Summarise:
- where the config is (`~/.config/tasteloop/brands/<id>.yaml`)
- where the secrets are (`~/.config/tasteloop/.env`, never share it)
- where notes, proposals and briefs appear
- how approval works (`status: freigegeben`, `freigegeben_von: <name>`; see `docs/digest-and-approval.md`)
- how agents use the guide (`docs/agents.md`, offer to add the CLAUDE.md snippet to one of the user's projects)

Remind them that the first digest comes on Monday, or run it now with `npm run digest -- --brand <config>` once a few Brand uploads exist.
