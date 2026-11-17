# Configuration reference

One YAML file per brand, for example `~/.config/tasteloop/brands/your-brand.yaml`. Start from [brands/example.yaml](../brands/example.yaml). The file is validated strictly: unknown keys and anything that looks like a secret stop the program with a clear message. Secrets never go here, see [security.md](security.md).

The keys are German for historical reasons. This page gives the English meaning.

## Brand

| Key | Meaning |
|---|---|
| `marke.id` | Brand id: lowercase, digits, dashes. Used for service names and state. |
| `marke.name` | Brand name. Shown in notes, prompts and the gallery. Code and UI never contain a brand name. |
| `sprache` | Interface language. Currently only `de`. |

## Telegram

| Key | Meaning |
|---|---|
| `telegram.chat_id` | The group's ID, a negative number. Find it with `npm run ids`. The bot ignores every other chat. |
| `telegram.absender` | Telegram user ID → display name. The same name always means the same person, which is how support is counted. |
| `telegram.nur_bekannte_absender` | `true` (default): ignore everyone not listed. |
| `telegram.zuordnung_minuten` | A voice note that is not a reply is attached to the sender's last image within this many minutes (default 15). |

## Vault

| Key | Meaning |
|---|---|
| `vault.wurzel` | Absolute path of the Obsidian vault (the folder that contains `.obsidian`). |
| `vault.ordner` | Folder inside the vault where Tasteloop writes, for example `Brand/Tasteloop`. |
| `vault.unterordner.*` | Optional: names of subfolders and files. Defaults: `Uploads`, `Uploads/Bilder`, `Vorschläge` (proposals), `Briefings`, `Galerie.base`, `Vorschläge.base`, `Moodboard.canvas`, `Änderungslog.md` (change log). |
| `vault.sync_nur` | Optional, for always-on hosts: the only folder that should exist there. `doctor` reports everything else. |
| `vault.sync_erlaubt` | Optional: single files outside `sync_nur` that you accept. |

Tasteloop writes only into `vault.ordner`, into the guide file (after approval) and into Obsidian's trash folder `.trash`. Any other path is refused.

## Brand guide

| Key | Meaning |
|---|---|
| `brand_guide.datei` | Path of your guide, relative to the vault root. |
| `brand_guide.frontmatter_sperre` | Frontmatter key in the guide that lists locked headings (`locked` in the template). |
| `brand_guide.gesperrte_abschnitte` | Extra locked headings. Subsections inherit the lock. |
| `brand_guide.praeambel_gesperrt` | Lock the title and the intro (default `true`). |
| `brand_guide.lernbereich` | Changes only land in these sections and their subsections, for example `2. Expression (learns)`. Empty means all unlocked sections. |
| `brand_guide.gesperrte_tokens` | Lines containing these strings never change, even inside the learning part. Use it for base colours. |
| `brand_guide.protokoll_abschnitt` | Section with the change log table. Each applied change adds a row. |
| `brand_guide.version_feld` / `datum_feld` | Frontmatter keys that are incremented and set to today on every change. |
| `brand_guide.analyse_kontext` | Sections the image analysis reads. Empty means the whole guide. |
| `brand_guide.briefing_bausteine` | Section with a table of prompt building blocks. Briefs copy matching rows word for word. |
| `brand_guide.briefing_anhaenge` | Sections every brief appends word for word, for example your review checklist. |

How these work together: [brand-guide.md](brand-guide.md).

## Approval

| Key | Meaning |
|---|---|
| `freigebende` | Names allowed to approve proposals (property `freigegeben_von`). Empty means anyone. This is trust-based, see [digest-and-approval.md](digest-and-approval.md). |

## Models

| Key | Default |
|---|---|
| `modelle.analyse` | `claude-sonnet-5-5` |
| `modelle.digest` | `claude-sonnet-5-5` |
| `modelle.briefing` | `claude-sonnet-5-5` |

## Transcription

| Key | Meaning |
|---|---|
| `transkription.lokal.aktiv` | Use whisper.cpp locally (default `true`, free). |
| `transkription.lokal.binary` / `modell` / `ffmpeg` | Paths. On macOS with Homebrew: `/opt/homebrew/bin/whisper-cli`, `/opt/homebrew/bin/ffmpeg`. |
| `transkription.lokal.sprache` | Spoken language, for example `en` or `de`. |
| `transkription.api.aktiv` | Fall back to an API if local fails. |
| `transkription.api.anbieter` | `elevenlabs` or `openai`. Needs `ELEVENLABS_API_KEY` or `OPENAI_API_KEY` in `.env`. |

## Other

| Key | Meaning |
|---|---|
| `analyse_bei_merken` | Also analyse "just keep" uploads (default `false`, saves money). |
| `ebenen_stichworte` | Optional: your own keywords for suggesting a level (`brand`, `kampagne`, `merken`). |
| `web.url` | Optional: gallery URL, only used for links in chat messages. |

## Environment variables

| Variable | Meaning |
|---|---|
| `TASTELOOP_BRAND_CONFIG` | Config path, instead of `--brand`. |
| `TASTELOOP_ENV_FILE` | Secrets file, default `~/.config/tasteloop/.env`. |
| `TASTELOOP_DATA_DIR` | Runtime state, default `~/.local/state/tasteloop`. |
