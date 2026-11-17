---
type: brand-guide
status: draft
version: 1
updated: 2026-01-01
locked: ["1. Core (locked)"]
---

# Brand Guide: Your Brand

**What this is:** the one place that says what your brand looks and sounds like. It is written for people, for Claude and for every agent that writes copy, builds creatives or briefs a campaign.
**How it changes:** Part 1 is locked and only people edit it, by hand. Part 2 learns from what your team collects: Tasteloop proposes changes every week, and a change only lands here after someone approves it. Every change is logged in Part 4.

## How to use this guide

- **Part 1 Core** is locked. No agent and no job writes into it, not even after an approval.
- **Part 2 Expression** learns. Proposals arrive as separate notes with evidence images and a marked diff. After `status: freigegeben` (approved) they are applied here and logged in Part 4.
- **Part 3 References** shows the gallery of everything your team collected.
- **Ground rule for every reference:** the style of the reference, the identity of your brand. Never copy someone else's motifs, claims, characters or layouts one to one.

---

## 1. Core (locked)

### 1.1 Purpose
[One or two sentences: why the brand exists and for whom.]

### 1.2 Audience
[Who you talk to. What they care about. What they are tired of.]

### 1.3 Never
- [Things the brand never shows, says or promises.]

### 1.4 Logo and base colours
- The logo is never altered, recoloured (except into the base colours) or distorted.
- The base colours in 2.1 belong to the identity. Accents may evolve; base colours only change by hand.

---

## 2. Expression (learns)

### 2.1 Colour

| Token | Name | Value | Use |
|---|---|---|---|
| `color.base` | [Name] | `#FFFFFF` | Main surface |
| `color.ink` | [Name] | `#111111` | Text, lines |
| `color.accent` | [Name] | `#E2231A` | One accent per surface |

- [How colour shows up in photos: through light and objects, not flat fills.]

### 2.2 Typography

| Token | Typeface | Weight | Use |
|---|---|---|---|
| `font.headline` | [Typeface] | [Weight] | Headlines |
| `font.text` | [Typeface] | [Weight] | Body text, buttons |

### 2.3 Imagery
- **In one sentence:** [the picture your brand would take].
- **Light:** [time of day, sources, shadows].
- **People:** [who, how they look, what they do].
- **Camera:** [distance, angle, depth of field].
- **Surface:** [clean or analogue, grain, imperfections].

### 2.4 Layout
- [Grid, white space, how text and images sit together, formats.]

### 2.5 Prompt building blocks

| Part | What it means | Prompt |
|---|---|---|
| **Film** | [what you mean] | `[Prompt text in English, exactly as it goes to the image model.]` |
| **Light** | [what you mean] | `[Prompt text]` |
| **Colour** | [what you mean] | `[Prompt text]` |
| **Closing** | no text, no logos | `No text, no logos, no brand marks, no watermark.` |

**Never in a prompt:** [words that push the model in the wrong direction].

### 2.6 Review checklist
One "no" is enough to reject an image:
- Does it look real, or like stock or glossy AI?
- Count hands, fingers and anything the brand relies on.
- Is the light coming from a believable source?
- Does it respect Part 1?

### 2.7 Open questions
- [What the team has not decided yet.]

---

## 3. References

![[Tasteloop/Galerie.base#Brand]]

- **Moodboard:** `Tasteloop/Moodboard.canvas`
- **Open proposals:** notes with `typ: vorschlag` and `status: offen`

---

## 4. Change log

| Date | Part | Change | Evidence | Approved by |
|---|---|---|---|---|
| 2026-01-01 | all | Guide created from the template | – | – |
