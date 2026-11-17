# Campaign briefs

Tap **Campaign** on an upload and Tasteloop writes a brief for a creative agent right after the analysis. It lands in `<folder>/Briefs/<id> Brief.md`.

## What a brief contains

- **Ground rule**, fixed in code and independent of the model: *the style of the reference, the identity of your brand. Never copy someone else's motifs, claims, characters or layouts one to one. The reference is a style reference, not a composition template for an image model.*
- the reference image and who sent it, with their reason
- goal
- style to take over, in abstract terms
- what **not** to take over (motifs, claims, people, layout, logos of the reference)
- limits from your brand guide, with section names
- motif and copy ideas in your brand's identity
- open questions
- **Prompt building blocks** from your guide's block table (2.5 in the template). The model only chooses which blocks fit; the text is copied from your guide word for word.
- appended sections from your guide, word for word, for example your review checklist (`guide.brief_appendix`)
- the image analysis as an appendix

## Working with briefs

- Hand the brief to your creative agent or to Claude together with your guide (see [agents.md](agents.md)).
- Set `status` to something other than `open` (for example `in_progress`) once you work with it. From then on, Tasteloop won't overwrite it when the upload is corrected.
- Switching the upload away from **Campaign** moves the brief to Obsidian's trash.

## Why the ground rule matters

Keeping a screenshot of someone else's ad as an internal reference is common practice. It gets risky when the result copies concrete design elements or could be confused with the original. The brief keeps the line explicit, and the "do not take over" list makes it concrete. This is not legal advice; check with your own counsel for anything that goes public.
