# Configuration reference

One YAML file per brand, for example `~/.config/tasteloop/brands/your-brand.yaml`. Start from [brands/example.yaml](../brands/example.yaml). The file is validated strictly: unknown keys and anything that looks like a secret stop the program with a clear message. Secrets never go here, see [security.md](security.md).

## Brand and language

| Key | Meaning |
|---|---|
| `brand.id` | Brand id: lowercase letters, digits, dashes. Used for service names and state. |
| `brand.name` | Brand name. Shown in notes, prompts and the gallery. Code and UI never contain a brand name. |
| `language` | Language of analyses, digests and briefs: `en` (default) or `de`. The interface (bot, notes, gallery) is always English. |
| `channels` | Capture channels. Currently `[telegram]`. |

## Telegram

| Key | Meaning |
|---|---|
| `telegram.chat_id` | The group's ID, a negative number. Find it with `npm run ids`. The bot ignores every other chat. |
| `telegram.senders` | Telegram user ID → display name. The same name always means the same person; that's how support is counted. |
| `telegram.known_senders_only` | `true` (default): ignore everyone not listed. |
| `telegram.attach_minutes` | A voice note that isn't a reply is attached to the sender's last image within this many minutes (default 15). |

## Vault

| Key | Meaning |
|---|---|
| `vault.root` | Absolute path of the Obsidian vault (the folder that contains `.obsidian`). |
| `vault.folder` | Folder inside the vault where Tasteloop writes, for example `Brand/Tasteloop`. |
| `vault.subfolders.*` | Optional names of subfolders and files. Defaults: `uploads: Uploads`, `images: Uploads/Images`, `proposals: Proposals`, `briefs: Briefs`, `gallery: Gallery.base`, `proposals_view: Proposals.base`, `moodboard: Moodboard.canvas`, `changelog: Changelog.md`. |
| `vault.sync_only` | Optional, for always-on hosts: the only folder that should exist there. `doctor` reports everything else. |
| `vault.sync_allowed` | Optional: single files outside `sync_only` that you accept. |

Tasteloop writes only into `vault.folder`, into the guide file (after approval) and into Obsidian's trash folder `.trash`. Any other path is refused.

## Brand guide

| Key | Meaning |
|---|---|
| `guide.file` | Path of your guide, relative to the vault root. |
| `guide.locked_key` | Frontmatter key in the guide that lists locked headings (default `locked`). |
| `guide.locked` | Extra locked headings. Subsections inherit the lock. |
| `guide.preamble_locked` | Lock the title and the intro (default `true`). |
| `guide.learning` | Changes only land in these sections and their subsections, for example `2. Expression (learns)`. Empty means all unlocked sections. |
| `guide.locked_tokens` | Lines containing these strings never change, even inside the learning part. Use it for base colours. |
| `guide.changelog_section` | Section with the changelog table. Each applied change adds a row. |
| `guide.version_key` / `guide.date_key` | Frontmatter keys that are incremented and set to today on every change (defaults `version`, `updated`). |
| `guide.analysis_context` | Sections the image analysis reads. Empty means the whole guide. |
| `guide.brief_blocks` | Section with a table of prompt building blocks. Briefs copy matching rows word for word. |
| `guide.brief_appendix` | Sections every brief appends word for word, for example your review checklist. |

How these work together: [brand-guide.md](brand-guide.md). Headings can be in any language; see "A guide in another language" there.

## Approval

| Key | Meaning |
|---|---|
| `approvers` | Names allowed to approve proposals (property `approved_by`). Empty means anyone. This is trust-based, see [digest-and-approval.md](digest-and-approval.md). |

## Models

| Key | Default |
|---|---|
| `models.analysis` | `claude-sonnet-5-5` |
| `models.digest` | `claude-sonnet-5-5` |
| `models.brief` | `claude-sonnet-5-5` |

## Transcription

| Key | Meaning |
|---|---|
| `transcription.local.enabled` | Use whisper.cpp locally (default `true`, free). |
| `transcription.local.binary` / `model` / `ffmpeg` | Paths. On macOS with Homebrew: `/opt/homebrew/bin/whisper-cli`, `/opt/homebrew/bin/ffmpeg`. |
| `transcription.local.language` | Spoken language of voice notes, for example `en` or `de`. |
| `transcription.local.timeout_seconds` | Timeout per voice note (default 180). |
| `transcription.api.enabled` | Fall back to an API if local transcription fails (default `false`). |
| `transcription.api.provider` | `elevenlabs` or `openai`. Needs `ELEVENLABS_API_KEY` or `OPENAI_API_KEY` in `.env`. |

## Other

| Key | Meaning |
|---|---|
| `analyze_keep` | Also analyse "Just keep" uploads (default `false`, saves money). |
| `level_keywords` | Optional: your own keywords for suggesting a level (`brand`, `campaign`, `keep`). The defaults cover English and German. |
| `web.url` | Optional: gallery URL, only used for links in chat messages. |

## Environment variables

| Variable | Meaning |
|---|---|
| `TASTELOOP_BRAND_CONFIG` | Config path, instead of `--brand`. |
| `TASTELOOP_ENV_FILE` | Secrets file, default `~/.config/tasteloop/.env`. |
| `TASTELOOP_DATA_DIR` | Runtime state, default `~/.local/state/tasteloop`. |

## Upgrading from the German format

Early versions used German config keys and German note properties. If `doctor` or the bot says your config "uses the old German config format", convert it:

```bash
npm run migrate-en -- --brand ~/.config/tasteloop/brands/your-brand.yaml
```

This is a dry run: it lists the notes and files it would convert and changes nothing. Then:

```bash
npm run migrate-en -- --brand ~/.config/tasteloop/brands/your-brand.yaml --apply
```

What it does:
- Writes a backup of your Tasteloop folder and of the old config to `~/.local/state/tasteloop/migrate-en-<time>/` first.
- Converts the config to the English keys.
- Converts property names, status values, system headings and markers in uploads, proposals, digests, briefs and the changelog note. Text written by people or by Claude keeps its language.
- Keeps your sections and unknown properties.
- Regenerates the two `.base` views and updates the moodboard's group names.
- **Keeps your folder and file names** (for example `Uploads/Bilder`, `Vorschläge`). It writes them into `vault.subfolders`, so no file moves and every link and embed keeps working.
- **Never touches your brand guide.**

Running it again does nothing. Stop the bot while migrating.
