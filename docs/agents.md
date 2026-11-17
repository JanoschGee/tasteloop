# Agents reading your taste

Tasteloop has no API of its own. Your agents read plain files from your vault: the brand guide, the references and the briefs. That works with Claude Code, Claude Projects, ChatGPT projects, Cursor and any agent that can read files.

## What to give an agent

| File | When |
|---|---|
| `Brand/Brand Guide.md` | always. Part 1 is binding, Part 2 is the current expression. |
| `<folder>/Briefs/<id> Brief.md` | for a campaign |
| `<folder>/Uploads/*.md` | if the agent should look at concrete references (each note links its image) |
| `<folder>/Changelog.md` and Part 4 of the guide | to see what changed recently and why |

## Claude Code

Start Claude Code in your project and add the vault folder:

```bash
claude --add-dir "/path/to/vault/Brand"
```

Then put a short instruction into your project's `CLAUDE.md`:

```markdown
## Brand

Before you write copy, design anything or create image prompts for Your Brand, read
`/path/to/vault/Brand/Brand Guide.md`.

- Part 1 (Core) is binding. Never contradict it.
- Part 2 (Expression) is the current style. Follow it unless the user says otherwise.
- For image prompts, compose them from the blocks in "2.5 Prompt building blocks" and use the
  block text word for word. Check the result against "2.6 Review checklist".
- For a campaign, read the brief in `/path/to/vault/Brand/Tasteloop/Briefs/` that the user names.
  Take the style of the reference, never its motifs, claims, people or layout.
- If something is not covered by the guide, say so instead of guessing, and suggest a reference
  the team could add.
```

## Claude Projects (claude.ai) and other chat tools

Add the guide file to the project's knowledge. Re-upload it after approved changes; the `version` in its frontmatter tells you which one is current. For a campaign, add the brief as well.

## Image models

Image models get the prompt, not the guide. Use the building blocks from 2.5 word for word and add motif and location yourself. Never feed the reference image into an image-to-image model: references are for direction, not material.

## Keeping agents current

The guide changes only through approved proposals, and each change raises `version` and adds a row to Part 4. An agent that reads the file directly is always current. For uploaded copies, check the version.
