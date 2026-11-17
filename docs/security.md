# Security and secrets

## Secrets

| Secret | Where it lives |
|---|---|
| Telegram bot token, Anthropic key, optional ElevenLabs/OpenAI key | `~/.config/tasteloop/.env`, mode `600` |
| Cloudflare tunnel credentials (if you share the gallery) | `~/.cloudflared/` |
| Obsidian login (Headless Sync) | stored by `ob` in your home folder |

They never go into the repo, the vault or the brand config. Tasteloop enforces this:
- The secrets file is refused if it lies inside the repo or the vault, and you get a warning if others can read it.
- The brand config is refused if it contains anything that looks like a token, or an unknown key.
- Notes that contain a secret pattern are never written to the vault.
- `.gitignore` covers `.env*` (except `.env.example`), key files, personal brand configs (`brands/*` except the example) and runtime data.
- `npm run check:secrets` runs as a pre-commit hook (`git config core.hooksPath .githooks`) and as a test.

**Never paste secrets into a chat with an AI**, including the setup assistant. Put them into the file with your own editor.

Use dedicated, revocable keys: a bot only for this group, an Anthropic key only for Tasteloop with a spending limit, a tunnel only for the gallery.

## What Tasteloop can touch

- **Writes:** only the configured folder in your vault, your guide file (after approval, with the lock check described in [brand-guide.md](brand-guide.md)), and Obsidian's trash folder.
- **Telegram:** only the configured group, only listed people. Buttons pressed by others do nothing. The token never appears in logs or error messages.
- **Gallery:** listens on `127.0.0.1` only, checks the Cloudflare Access token on every request, and is closed when not configured. It serves images only from the brand folder and does not execute raw HTML from notes.

## What leaves your machine

- **Images, captions, transcripts and your guide go to the Anthropic API** for analysis, digests and briefs. Check that this fits your data rules. API data is not used for training by default; see Anthropic's terms.
- With the optional transcription API, voice notes go to ElevenLabs or OpenAI. With local whisper.cpp they stay on your machine.
- Telegram carries your images and voice notes. Telegram group chats are not end-to-end encrypted.

## A dedicated machine without disk encryption

If your always-on machine must boot without anyone present (FileVault off), compensate:
- Run the services as a separate user without admin rights who never logs in. The macOS installer does this.
- Keep secrets only in that user's home, with mode `600`.
- Use dedicated, revocable keys, so a lost machine costs you a few minutes of revoking (see below).
- Sync only the brand folder to the machine (see [always-on.md](always-on.md)).

## Revoking everything (lost or compromised machine)

| Step | Where |
|---|---|
| Revoke the bot token | @BotFather → `/revoke` |
| Disable the Anthropic key | console.anthropic.com → API keys |
| Delete optional transcription keys | ElevenLabs / OpenAI console |
| Remove the device from Obsidian Sync, or change the password | Obsidian → Settings → Sync |
| Delete the tunnel and the Access app | Cloudflare Zero Trust |
| If still reachable: stop the services and delete the service user | `sudo launchctl bootout …`, `sudo sysadminctl -deleteUser branding` |

Afterwards, check the guide's change log and the proposals for unexpected approvals.

## Approval is trust-based

Obsidian cannot prove who set `freigegeben_von`. Everyone who can write to the vault can approve. Keep the vault shared with the people you'd also trust with the brand guide.
