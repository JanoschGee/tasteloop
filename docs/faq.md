# FAQ

**Why not just a Markdown file in a Claude project?**
That file is where your taste ends up, and Tasteloop keeps it as exactly that: plain Markdown. What a file alone doesn't do is collect references from the whole team with the reason, count who backs what, surface disagreements and keep the core locked. That loop is the product.

**Do I need Obsidian?**
The memory is a folder of Markdown files with Obsidian features: properties, a Bases gallery and a canvas moodboard. You can read it without Obsidian, but approving proposals means editing a property, which is most comfortable in Obsidian.

**Can we use Slack, Teams or WhatsApp instead of Telegram?**
Not yet. Telegram works without a public server address, which keeps self-hosting simple.

**Which languages does it speak?**
The interface (bot, notes, gallery, commands) is English. Analyses, digests and briefs come in English or German (`language: en` or `de`). Your brand guide can be in any language; see [brand-guide.md](brand-guide.md#a-guide-in-another-language).

**Which AI models does it use?**
Claude for image analysis, digests and briefs (`claude-sonnet-5-5` by default, configurable). Transcription runs locally with whisper.cpp, with an optional ElevenLabs or OpenAI fallback.

**Will Tasteloop change my brand guide without asking?**
No. It only proposes. A change lands after a listed person approves it, only in the sections you allow, and never in the locked core. Disagreements need an explicit "resolved" on top.

**What happens to images of other brands' ads?**
They are stored in your vault as internal references. Campaign briefs abstract the style and explicitly list what must not be copied. Whether your use is fine legally depends on your jurisdiction and on what you publish. This is not legal advice.

**Can several brands share one installation?**
Yes. Use one config file per brand, each with its own Telegram bot (two processes can't share one token), its own group and its own folder, and start one bot per config.

**Is there a hosted version?**
Not yet. Maybe later, for teams.

**Where do I get help?**
The docs, `npm run doctor`, and the setup assistant (`claude`, then "set up tasteloop"). There is no personal support.

**License?**
MIT.
