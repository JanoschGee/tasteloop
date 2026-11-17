# Weekly digest and approval

Once a week (Monday 8:00 in the provided schedules), the digest reads all new, analysed **Brand** uploads and asks Claude for at most five changes to Part 2 of your guide. Each proposal becomes its own note in `<folder>/Proposals/`. The group gets a short message with the titles and their support.

## What a proposal contains

- Title, target section, and whether it **replaces** or **extends** the section (`change: replace` / `extend`)
- the reasoning
- a **diff** against the current guide
- the new text between two markers, which you may edit before approving
- the **evidence**: links to the uploads, with their images
- the **support** (see below)

Proposals that would touch a locked section are never created as proposals. They appear as "core notes" in the digest note, for people to decide.

## Support: who backs it

Tasteloop counts the support itself, from the evidence, not from what the model says:

| Property | Meaning |
|---|---|
| `support_people` | number of **different** people |
| `support_refs` | number of references |
| `supporters` | their names |

The note shows "**Support:** 3 people, 5 references (Alex, Kim, Sam)". `Proposals.base` sorts by people, then by references, so broadly backed proposals come first. Ten images from one person count as one person.

## Single voice

If only one person backs a proposal, it is marked `single_voice: true` and gets a "Single voice" note. It is **not** hidden and can be approved normally. It just deserves a conscious decision.

## Disputes

If one person praises something another criticises, the proposal gets a **Disputed** section. For each point it shows:
- what the point is
- the references **for** it, with names
- the references **against** it, with names

`disputed` counts the points. Tasteloop checks every reported dispute: both sides need evidence, from different people. Otherwise the dispute is dropped and listed in the digest note.

**A disputed proposal is never applied quietly.** Even after approval it waits until someone sets `dispute_resolved: true`, ideally after adjusting the text. Disputes without a proposal are listed in the digest note.

## Approve or reject

In Obsidian, open the proposal and set its properties:

| To | Set |
|---|---|
| approve | `status: approved` and `approved_by: <your name>` |
| reject | `status: rejected` |
| approve a disputed proposal | additionally `dispute_resolved: true` |

Every 10 minutes the approval job applies approved proposals. It writes the guide, adds a changelog row, raises `version` and sets the proposal to `applied`, with a log at the end of the note. The group gets a message.

Other outcomes:

| Status or message | Meaning | What to do |
|---|---|---|
| stays `approved`, "not in the approvers list" | `approved_by` missing or not in `approvers` | enter a listed name |
| stays `approved`, "People disagree here" | dispute not resolved | resolve it, then set `dispute_resolved: true` |
| `locked` | the target is locked or outside the learning area | change it by hand if you really want to |
| `conflict` | the section changed since the proposal was written (replace only) | check it, then approve again, or delete `base_hash` to force it |
| `error` | for example the section wasn't found | see the log at the end of the note |

**Approval is trust-based.** Obsidian can't prove who set a property. Anyone with write access to the vault can approve. For a small team that's usually fine; the changelog, the proposal note and Obsidian's file history show what happened.

## Run it now

```bash
npm run digest -- --brand <config>
```

```bash
npm run apply -- --brand <config>
```

Add `--quiet` to either command to skip the chat message.
