# Capturing with Telegram

Everyone in the group can add references. The bot only listens to the configured group and, by default, only to people listed in `telegram.senders`.

## Send a reference

1. Send an **image**, as a photo or as a file (JPG, PNG, WebP, GIF).
2. Give the **reason**:
   - as the image caption, or
   - as a **voice note** that replies to the image, or comes within 15 minutes from the same person.
3. The bot replies with three buttons:

| Button | Meaning | What happens |
|---|---|---|
| **Brand** | It's about identity: colour, imagery, typography, tone. | Claude analyses it. It feeds the weekly digest. |
| **Campaign** | "We want an ad like this." | Claude analyses it and writes a campaign brief right away. |
| **Just keep** | Archive only. | Stored, not analysed (unless `analyze_keep: true`). |

If your caption or voice note makes the level obvious, the bot marks its suggestion with 👉. You still choose with a tap.

## Correct, change, delete

| You want to | Do this |
|---|---|
| Add a correction | Reply with text to the image or to the bot's message. It's stored in the note and the analysis runs again. |
| Change the level | Tap another button. Switching away from Campaign moves the brief to Obsidian's trash. |
| Retry after an error | Tap the level again. |
| Delete | Reply `/delete` to the image or to the bot's message. Note, image and brief go to Obsidian's trash (`.trash`), recoverable until you empty it. |
| Get help | `/help` |

## What lands in the vault

One note per upload in `<folder>/Uploads/`, the image in `Uploads/Images/`. Properties:

| Property | Meaning |
|---|---|
| `type` | `upload` |
| `level` | `open`, `brand`, `campaign` or `keep` |
| `suggested_level` | the bot's suggestion from your words |
| `sender` | who sent it |
| `date` | when |
| `status` | `new`, `processing`, `analyzed`, `in_digest` (read by a digest) or `error` |
| `image` | the image |
| `style` | style keywords from the analysis |
| `brief` | the brief, for campaigns |

Below the properties you find the image, then **Why**, **Transcript**, **Corrections** and **Analysis** (likes, dislikes, style, brand fit). Sections you add yourself in Obsidian are kept when the note is rewritten.

`Gallery.base` shows all uploads as cards (Obsidian Bases). `Moodboard.canvas` arranges them by level, and images you move on the canvas stay where you put them.

## Tips for good references

- Say **why**, not just "nice". "The light comes from the side and the skin isn't retouched" teaches more than "love it".
- Say what you **don't** like, too. Dislikes are just as useful.
- Different people, same thing: that's what turns a reference into a rule.
