# Getting started (by hand)

The guided way is faster: run `claude` in the repo and say "set up tasteloop". This page describes the same steps for doing it yourself. Plan about an hour.

## 1. Prerequisites

| What | Check | Install (macOS) | Install (Debian/Ubuntu) |
|---|---|---|---|
| Node.js 22+ | `node -v` | `brew install node@22` | via [nodesource](https://github.com/nodesource/distributions) or `nvm` |
| ffmpeg | `ffmpeg -version` | `brew install ffmpeg` | `sudo apt install ffmpeg` |
| whisper.cpp | `whisper-cli -h` | `brew install whisper-cpp` | build from [whisper.cpp](https://github.com/ggml-org/whisper.cpp) |
| Obsidian vault | a folder containing `.obsidian` | [obsidian.md](https://obsidian.md) | same |
| Telegram | an account | app | app |
| Anthropic API key | [console.anthropic.com](https://console.anthropic.com) | | |

Download a Whisper model (about 550 MB):

```bash
mkdir -p ~/.local/share/whisper && curl -fL -o ~/.local/share/whisper/ggml-large-v3-turbo-q5_0.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin
```

Without whisper.cpp you can transcribe through an API instead (ElevenLabs or OpenAI), see [configuration.md](configuration.md#transcription).

## 2. Code

```bash
git clone https://github.com/JanoschGee/tasteloop && cd tasteloop && npm install
```

## 3. Telegram bot and group

1. In Telegram, open **@BotFather** and send `/newbot`. Choose a name. BotFather shows the bot token **once**; keep it for step 4 and don't paste it anywhere else.
2. Send `/setprivacy` to BotFather, choose your bot and set it to **Disable**. Otherwise the bot cannot see images in groups.
3. Create a group with your team and add the bot.

## 4. Secrets

Create the secrets file outside the repo and the vault, readable only by you:

```bash
mkdir -p ~/.config/tasteloop && cp .env.example ~/.config/tasteloop/.env && chmod 600 ~/.config/tasteloop/.env
```

Open `~/.config/tasteloop/.env` in your editor and fill in `TELEGRAM_BOT_TOKEN` and `ANTHROPIC_API_KEY`. Details: [security.md](security.md).

## 5. Config

```bash
mkdir -p ~/.config/tasteloop/brands && cp brands/example.yaml ~/.config/tasteloop/brands/your-brand.yaml
```

Edit it: brand name and id, vault path, folder, guide path, approvers. Every key is explained in [configuration.md](configuration.md). The config lives outside the repo because it contains chat IDs, names and paths.

Find the chat ID and the user IDs. Everyone writes something in the group first, and the bot must not be running yet:

```bash
npm run ids -- --brand ~/.config/tasteloop/brands/your-brand.yaml
```

Copy the negative group ID into `telegram.chat_id` and every user ID with a name into `telegram.senders`.

## 6. Brand guide and vault

If you have no guide yet, copy the template into your vault and fill in Part 1:

```bash
mkdir -p "/path/to/vault/Brand" && cp templates/brand-guide.md "/path/to/vault/Brand/Brand Guide.md"
```

How the guide works: [brand-guide.md](brand-guide.md). Then create the Tasteloop folder with gallery, moodboard and change log:

```bash
npm run init-vault -- --brand ~/.config/tasteloop/brands/your-brand.yaml
```

## 7. Check and run

```bash
npm run doctor -- --brand ~/.config/tasteloop/brands/your-brand.yaml
```

Everything should show ✔. Then start the bot:

```bash
npm run bot -- --brand ~/.config/tasteloop/brands/your-brand.yaml
```

Send an image with a caption to the group, tap **Brand** and open the new note in `Brand/Tasteloop/Uploads/` in Obsidian. Stop the bot with Ctrl+C.

## 8. Make it permanent

The bot only works while it runs. Choose your setup in [always-on.md](always-on.md): laptop, Mac mini or Linux server. The weekly digest and the approval job are scheduled there too.
