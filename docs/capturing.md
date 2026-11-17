# Capturing with Telegram

Everyone in the group can add references. The bot only listens to the configured group and, by default, only to people listed in `telegram.absender`.

## Send a reference

1. Send an **image**, as a photo or as a file (JPG, PNG, WebP, GIF).
2. Give the **reason**:
   - as the image caption, or
   - as a **voice note** that replies to the image (or comes within 15 minutes from the same person).
3. The bot replies with three buttons:

| Button | Meaning | What happens |
|---|---|---|
| **Brand** | It is about identity: colour, imagery, typography, tone. | Claude analyses it. It feeds the weekly digest. |
| **Kampagne** (campaign) | "We want an ad like this." | Claude analyses it and writes a campaign brief right away. |
| **Nur merken** (just keep) | Archive only. | Stored, not analysed (unless `analyse_bei_merken: true`). |

If your caption or voice note makes the level obvious, the bot marks its suggestion with 👉. You still choose with a tap.

## Correct, change, delete

| You want to | Do this |
|---|---|
| Add a correction | Reply with text to the image or to the bot's message. It is stored in the note and the analysis runs again. |
| Change the level | Tap another button. Switching away from campaign moves the brief to Obsidian's trash. |
| Retry after an error | Tap the level again. |
| Delete | Reply `/delete` (or `/löschen`) to the image or the bot's message. Note, image and brief go to Obsidian's trash (`.trash`), recoverable until you empty it. |
| Get help | `/help` |

## What lands in the vault

One note per upload in `<ordner>/Uploads/`, the image in `Uploads/Bilder/`. Properties (German names):

| Property | Meaning |
|---|---|
| `ebene` | level: `offen` (open), `brand`, `kampagne` (campaign), `merken` (just keep) |
| `absender` | who sent it |
| `datum` | when |
| `status` | `neu` (new), `in-arbeit`, `analysiert` (analysed), `im-digest` (read by a digest), `fehler` (error) |
| `bild` | the image |
| `stil` | style keywords from the analysis |

Below the properties: the image, the reason (Begründung), the transcript, corrections and the analysis (likes, dislikes, style features, relation to the brand). Sections you add yourself in Obsidian are kept when the note is rewritten.

`Galerie.base` shows all uploads as cards (Obsidian Bases), and `Moodboard.canvas` arranges them by level. Images you move on the canvas stay where you put them.

## Tips for good references

- Say **why**, not just "nice". "The light comes from the side and the skin isn't retouched" teaches more than "love it".
- Say what you **don't** like as well. Dislikes are just as useful.
- Different people, same thing: that is what turns a reference into a rule.
