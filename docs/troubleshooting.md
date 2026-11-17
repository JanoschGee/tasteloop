# Troubleshooting

Start with:

```bash
npm run doctor -- --brand <config>
```

It checks the config, the vault, the guide (including locked headings that don't exist), the secrets, whisper.cpp, ffmpeg and, if set, the sync scope. Every line should show ✔.

| Symptom | Cause and fix |
|---|---|
| The bot doesn't react to images | Privacy mode is still on: @BotFather → `/setprivacy` → Disable, then remove the bot from the group and add it again. Also check that `telegram.chat_id` is right and the sender is listed in `telegram.senders`. |
| `ids` shows nothing | Write something in the group first. Stop the running bot: it consumes the messages `ids` would read. |
| "⚠️ Analysis failed" in the chat | Claude was not reachable or the key is invalid. Tap the level again to retry. Check the key and your spending limit. |
| Voice note not transcribed | `doctor` shows what's missing (whisper-cli, model, ffmpeg). Or set up the API fallback. |
| "Which image is this for?" | The voice note wasn't a reply and came more than 15 minutes after your last image. Reply to the image instead. |
| Note exists, but the gallery card has no image | Obsidian Bases needs the `bild` property; don't rename it. Large images may take a moment to sync. |
| Proposal stays `approved` | `approved_by` missing or not in `approvers`; or it is disputed and lacks `dispute_resolved: true`. |
| Proposal becomes `locked` | The target is locked or outside the learning area. That's intended; change it by hand. |
| Proposal becomes `conflict` | The section changed after the proposal was written. Check, then approve again, or delete `base_hash` to force it. |
| `doctor` says a locked heading is missing | The heading in your guide doesn't match the config (typo, renamed section). Fix one of them. |
| The digest finds nothing | Only uploads with level **Brand**, status `analyzed` and not yet in a digest count. |
| "uses the old German config format" | Your config is from an early version. Convert it with `npm run migrate-en` (see [configuration.md](configuration.md#upgrading-from-the-german-format)). |
| Gallery answers 503 | No Cloudflare Access configured. Set `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD`, or `TASTELOOP_WEB_ACCESS_OFF=1` for local-only use. |
| "Secret pattern found …" when writing | A note or the config contains something that looks like a key. Remove it. Secrets belong in `.env`. |
| State lost (`~/.local/state/tasteloop`) | Harmless. Notes in the vault are the source of truth. Only replies to older bot messages can't be matched anymore. |

## Logs

| Setup | Where |
|---|---|
| Terminal | the terminal itself |
| cron (laptop) | the log files you set in the crontab |
| macOS installer | `/Users/branding/Library/Logs/tasteloop/<job>.log` |
| systemd | `journalctl -u tasteloop-bot` |
