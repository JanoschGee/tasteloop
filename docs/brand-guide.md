# The brand guide: core, expression, change log

Your brand guide is a single Markdown file in your vault. It is what your agents read. Tasteloop proposes changes to it, but a change only lands after a person approves it, and only in the parts you allow. Start from [templates/brand-guide.md](../templates/brand-guide.md).

## Three layers

| Part | What it holds | Who changes it |
|---|---|---|
| **1. Core (locked)** | Purpose, audience, what you never do, logo, base colours | People only, by hand. No job ever writes here, not even after an approval. |
| **2. Expression (learns)** | Colour accents, typography, imagery, layout, prompt building blocks, review checklist | Tasteloop proposes, a person approves, then Tasteloop writes it. |
| **3. References** | The gallery of everything your team collected | Fills itself: the template embeds `Gallery.base`. |
| **4. Changelog** | One row per applied change | Tasteloop, on every applied change |

## How the lock works

The template's frontmatter lists the locked headings:

```yaml
---
version: 1
updated: 2026-01-01
locked: ["1. Core (locked)"]
---
```

With the example config:

- Everything under a locked heading is locked, including subsections.
- The title and the intro are locked.
- The learning area is `2. Expression (learns)`. Nothing outside it changes automatically.
- Lines containing `` `color.base` `` or `` `color.ink` `` are locked, even though they sit in Part 2. Accents in the same table may still evolve.
- The frontmatter is locked too, except `version` and `updated`. Nobody can remove the lock through a proposal.

Before writing, Tasteloop compares the old and the new guide character by character. Only the approved section, the new change-log row, `version` and `updated` may differ. The check runs twice, the second time against a fresh read of the file right before writing. A proposal text with its own headings is refused, so it cannot fake a locked section. All of this is covered by tests.

## What an approved change does

1. It replaces or extends the text of exactly one section in Part 2.
2. It adds a row to the changelog table: date, part, change, a link to the proposal, the person who approved it.
3. It sets `version` + 1 and `updated` to today.

A backup of the previous version is stored outside the vault, under `~/.local/state/tasteloop/<brand>/guide-backups/`.

## Prompt building blocks and checklist

Two sections in Part 2 are used by campaign briefs (see [campaign-briefs.md](campaign-briefs.md)):

- **2.5 Prompt building blocks:** a table. The first column is the name and the last column is the prompt text exactly as it goes to an image model. Briefs copy matching rows word for word; the model only picks the names.
- **2.6 Review checklist:** appended to every brief word for word.

The weekly digest may propose changes to these sections like to any other part of Part 2.

## Tips

- Keep Part 1 short and hard. If a rule may never change by accident, it belongs there.
- Write Part 2 the way you'd brief a good freelancer: concrete, visual, with examples.
- If you already have a guide, add a frontmatter with `locked: [...]` and set `guide.learning` in your config to the sections that may learn. Headings don't have to match the template; `npm run doctor` tells you if a configured heading is missing.

## A guide in another language

Your guide doesn't have to be English. Tasteloop finds sections by the headings you configure, in any language:

- The lock comes from the frontmatter list. If your guide uses another key, for example `gesperrt: ["1. Kern (gesperrt)"]`, set `guide.locked_key: gesperrt`.
- Set `guide.learning`, `guide.changelog_section`, `guide.brief_blocks` and `guide.brief_appendix` to your headings, for example `"2. Ausdruck (lernt)"` or `"4. Änderungsprotokoll"`.
- Changelog tables with German column headers (Datum, Teil, Änderung, Beleg, Freigabe) are filled correctly, and so are tables with English headers.
- If your date field is named differently, for example `stand`, set `guide.date_key: stand`.
- Set `language: de` to get analyses, proposals and briefs in German. Proposed guide text follows your guide's language.

This is covered by tests with a German guide.
