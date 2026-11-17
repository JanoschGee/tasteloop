# Weekly digest and approval

Once a week (Monday 8:00 in the provided schedules), the digest reads all new, analysed **Brand** uploads and asks Claude for at most five changes to Part 2 of your guide. Each proposal becomes its own note in `<ordner>/Vorschläge/` (proposals). The group gets a short message with the titles and their support.

## What a proposal contains

- Title, target section, and whether it **replaces** or **extends** the section (`art: ersetzen` / `ergaenzen`).
- The reasoning.
- A **diff** against the current guide.
- The new text between two markers. You may edit it before approving.
- The **evidence**: links to the uploads, with their images.
- The **support** (see below).

Proposals that would touch a locked section are never created as proposals. They appear as notes for humans under "Kern-Hinweise" (core notes) in the digest note.

## Support: who backs it

Tasteloop counts the support itself from the evidence, not from what the model says:

| Property | Meaning |
|---|---|
| `stuetze_personen` | number of **different** people |
| `stuetze_belege` | number of references |
| `stuetze_namen` | their names |

The note shows "**Stütze:** 3 Personen, 5 Belege (Alex, Kim, Sam)" (support: 3 people, 5 references). `Vorschläge.base` sorts by people, then by references, so broadly backed proposals come first. Ten images from one person count as one person.

## Single voice

If only one person backs a proposal, it is marked `einzelstimme: true` and shows a note "Einzelstimme" (single voice). It is **not** hidden and can be approved normally. It just deserves a conscious decision.

## Disagreement

If one person praises something another criticises, the proposal gets a section "**Uneinig**" (disagreement):
- what the point is
- the references **for** it, with names
- the references **against** it, with names

`uneinig` counts the points. Tasteloop checks every reported disagreement: both sides need evidence, and from different people. Otherwise it is dropped and listed under "dropped" in the digest note.

**A disagreeing proposal is never applied quietly.** Even after approval it waits until someone sets `uneinig_geklaert: true` (resolved), ideally after adjusting the text. Disagreements without a proposal are listed in the digest note.

## Approve or reject

In Obsidian, open the proposal and set the properties:

| To | Set |
|---|---|
| approve | `status: freigegeben` and `freigegeben_von: <your name>` |
| reject | `status: abgelehnt` |
| approve a disagreement | additionally `uneinig_geklaert: true` |

Every 10 minutes the approval job applies approved proposals: it writes the guide, adds a change-log row, raises `version`, and sets the proposal to `übernommen` (applied) with a log at the end of the note. The group gets a message.

Other outcomes:

| Status / message | Meaning | What to do |
|---|---|---|
| stays `freigegeben`, message "not allowed" | `freigegeben_von` is not in `freigebende` | enter a listed name |
| stays `freigegeben`, message "uneinig" | disagreement not resolved | resolve, then `uneinig_geklaert: true` |
| `gesperrt` (locked) | target is locked or outside the learning area | change it by hand if you really want to |
| `konflikt` (conflict) | the section changed since the proposal (replace only) | check, then approve again, or delete `alt_hash` to force |
| `fehler` (error) | e.g. section not found | see the log at the end of the note |

**Approval is trust-based.** Obsidian cannot prove who set a property. Anyone with write access to the vault can approve. For a small team that is usually fine; the change log, the proposal note and Obsidian's file history show what happened.

## Run it now

```bash
npm run digest -- --brand <config>
```

```bash
npm run apply -- --brand <config>
```

Add `--still` to either command to skip the chat message.
