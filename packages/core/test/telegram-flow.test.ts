/**
 * Integration test: Telegram updates (fixtures) -> notes, images, moodboard, brief in the vault.
 * Telegram, Claude and transcription are mocked.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMd } from "../src/frontmatter";
import { LlmError } from "../src/llm/client";
import { BotState } from "../src/state";
import { HELP_TEXT, runPolling, TelegramHandler } from "../src/telegram/handler";
import { listUploads, readUpload } from "../src/vault/uploads";
import { FakeTelegram, FakeTranscriber, makeServices, update } from "./helpers";

const F = "Brand/Tasteloop";

function setup(opts: Parameters<typeof makeServices>[0] = {}) {
  const env = makeServices(opts);
  const tg = new FakeTelegram();
  const state = BotState.inMemory();
  const handler = new TelegramHandler(env.svc, tg, state);
  return { ...env, tg, state, handler };
}

async function photo(h: ReturnType<typeof setup>) {
  await h.handler.handleUpdate(update("photo-caption"));
  const [u] = listUploads(h.vault);
  return u;
}

describe("capturing an image", () => {
  it("saves image and note with English properties and asks for the level with buttons", async () => {
    const h = setup();
    const u = await photo(h);
    expect(u.id).toMatch(/^20261112-1530-[0-9a-f]{4}$/);
    expect(u.level).toBe("open");
    expect(u.sender).toBe("Anna");
    expect(u.status).toBe("new");
    expect(u.why).toContain("colour palette");
    expect(u.suggestedLevel).toBe("brand");
    expect(u.image).toBe(`${F}/Uploads/Images/${u.id}.jpg`);
    expect(existsSync(join(h.root, u.image))).toBe(true);
    const note = readFileSync(join(h.root, F, "Uploads", `${u.id}.md`), "utf8");
    const { props, body } = parseMd(note);
    expect(props).toMatchObject({ type: "upload", level: "open", sender: "Anna", status: "new", brand: "Testbrand", image: `[[${u.image}]]`, tags: ["tasteloop/upload"] });
    expect(props.date).toBe("2026-11-12T15:30:00");
    expect(body).toContain(`![[${u.image}]]`);
    expect(body).toContain("## Why\n\n> The colour palette");
    expect(body).toContain("## Transcript\n\n_(no voice note)_");
    const msg = h.tg.sent[0];
    expect(msg.replyTo).toBe(10);
    expect(msg.text).toContain("Saved: ");
    expect(msg.text).toContain("Suggestion: Brand. Please pick a level.");
    expect(msg.keyboard![0].map((b) => b.text)).toEqual(["👉 Brand", "Campaign", "Just keep"]);
    expect(msg.keyboard![0].map((b) => b.callback_data)).toEqual([`lvl:${u.id}:brand`, `lvl:${u.id}:campaign`, `lvl:${u.id}:keep`]);
    const canvas = JSON.parse(readFileSync(join(h.root, F, "Moodboard.canvas"), "utf8"));
    expect(canvas.nodes.find((n: { id: string }) => n.id === `upl-${u.id}`).file).toBe(u.image);
    expect(canvas.nodes.find((n: { id: string }) => n.id === "grp-campaign").label).toBe("Campaign");
    expect(h.llm.calls).toHaveLength(0);
  });

  it("accepts images sent as files and suggests a campaign", async () => {
    const h = setup();
    await h.handler.handleUpdate(update("document-image-campaign"));
    const [u] = listUploads(h.vault);
    expect(u.image.endsWith(".png")).toBe(true);
    expect(u.sender).toBe("Ben");
    expect(u.suggestedLevel).toBe("campaign");
  });

  it("ignores other chats and unknown senders", async () => {
    const h = setup();
    await h.handler.handleUpdate(update("foreign-chat"));
    await h.handler.handleUpdate(update("unknown-sender"));
    expect(listUploads(h.vault)).toHaveLength(0);
    expect(h.tg.sent).toHaveLength(0);
  });

  it("handles the same update only once", async () => {
    const h = setup();
    await h.handler.handleUpdate(update("photo-caption"));
    await h.handler.handleUpdate(update("photo-caption"));
    expect(listUploads(h.vault)).toHaveLength(1);
    expect(h.state.data.offset).toBe(1002);
  });

  it("/help explains the flow in English", async () => {
    const h = setup();
    const u = update("delete-reply", { "/delete": "/help" });
    delete u.message!.reply_to_message;
    await h.handler.handleUpdate(u);
    expect(h.tg.sent[0].text).toBe(HELP_TEXT);
  });
});

describe("voice note", () => {
  it("transcribes the reply to the image and stores it in the note", async () => {
    const t = new FakeTranscriber("For the campaign: we need an ad like this, and a poster");
    const h = setup({ transcriber: t });
    const u = await photo(h);
    await h.handler.handleUpdate(update("voice-reply"));
    const after = readUpload(h.vault, u.id)!;
    expect(after.transcript).toEqual(["For the campaign: we need an ad like this, and a poster"]);
    expect(after.suggestedLevel).toBe("campaign");
    expect(h.tg.lastEdit().text).toContain("Suggestion: Campaign");
    expect(h.tg.lastEdit().keyboard![0][1].text).toBe("👉 Campaign");
  });

  it("attaches a voice note without reply to the sender's last image", async () => {
    const h = setup();
    const u = await photo(h);
    const voice = update("voice-reply");
    delete voice.message!.reply_to_message;
    await h.handler.handleUpdate(voice);
    expect(readUpload(h.vault, u.id)!.transcript).toHaveLength(1);
  });

  it("reports a transcription error in the chat without crashing", async () => {
    const h = setup({ transcriber: new FakeTranscriber("", true) });
    const u = await photo(h);
    await h.handler.handleUpdate(update("voice-reply"));
    expect(readUpload(h.vault, u.id)!.transcript).toHaveLength(0);
    expect(h.tg.sent.at(-1)!.text).toContain("could not be transcribed");
  });
});

describe("choosing a level and analysing", () => {
  it("Brand: Claude analyses image and transcript, the note gets the analysis", async () => {
    const h = setup();
    const u = await photo(h);
    await h.handler.handleUpdate(update("voice-reply"));
    await h.handler.handleUpdate(update("callback-brand", { __ID__: u.id }));
    const after = readUpload(h.vault, u.id)!;
    expect(after.level).toBe("brand");
    expect(after.status).toBe("analyzed");
    expect(after.analysis?.likes).toContain("Warm side light");
    expect(after.analysis?.style.color).toContain("Terracotta #C8643B");
    const call = h.llm.calls[0];
    expect(call.purpose).toBe("analysis");
    expect(call.model).toBe("claude-sonnet-5-5");
    expect(call.content[0]).toMatchObject({ type: "image", mediaType: "image/jpeg" });
    expect((call.content[1] as { text: string }).text).toContain("The light is great");
    expect(call.system).toContain('the brand "Testbrand"');
    expect(call.system).toContain("Write all text values in English.");
    expect(call.system).toContain("Real people, no stock.");
    expect(call.system).not.toContain("boldly and warmly");
    expect(h.tg.answers[0]).toEqual({ id: "cb-1", text: "Level: Brand" });
    expect(h.tg.lastEdit().text).toContain("Level: Brand");
    expect(h.tg.lastEdit().keyboard![0][0].text).toBe("✅ Brand");
    const { props, body } = parseMd(readFileSync(join(h.root, F, "Uploads", `${u.id}.md`), "utf8"));
    expect(props.style).toEqual(["warm", "analogue", "grain"]);
    expect(body).toContain("## Analysis\n\nA couple at the kitchen table");
    expect(body).toContain("### Likes\n\n- Warm side light");
    expect(body).toContain("- **Colour:** Off-white; Terracotta #C8643B");
    expect(after.brief).toBeUndefined();
  });

  it("language: de asks Claude for German analyses (interface stays English)", async () => {
    const h = setup({ overrides: (c) => (c.language = "de") });
    const u = await photo(h);
    await h.handler.handleUpdate(update("callback-brand", { __ID__: u.id }));
    expect(h.llm.calls[0].system).toContain("Write all text values in German.");
    expect(h.tg.lastEdit().text).toContain("Level: Brand");
  });

  it("Campaign: also writes a brief with reference image, limits and the fixed ground rule", async () => {
    const h = setup();
    const u = await photo(h);
    await h.handler.handleUpdate(update("callback-brand", { __ID__: u.id, ":brand": ":campaign" }));
    const after = readUpload(h.vault, u.id)!;
    expect(after.level).toBe("campaign");
    expect(after.brief).toBe(`${F}/Briefs/${u.id} Brief.md`);
    const { props, body } = parseMd(readFileSync(join(h.root, after.brief!), "utf8"));
    expect(props).toMatchObject({ type: "brief", status: "open", reference: `[[${u.image}]]`, tags: ["tasteloop/brief"] });
    expect(body).toContain("The style of the reference, the identity of Testbrand.");
    expect(body).toContain("Other brands' motifs, claims, characters and layouts are never copied one to one");
    expect(body).toContain(`![[${u.image}]]`);
    expect(body).toContain("**3. Look and Feel > Imagery:** Real people, no stock.");
    expect(body).toContain("## Do not take over\n\n- The couple motif of the reference");
    const bcall = h.llm.calls.find((c) => c.purpose === "brief")!;
    expect(bcall.system).toContain("boldly and warmly");
    const canvas = JSON.parse(readFileSync(join(h.root, F, "Moodboard.canvas"), "utf8"));
    const grp = canvas.nodes.find((n: { id: string }) => n.id === "grp-campaign");
    const node = canvas.nodes.find((n: { id: string }) => n.id === `upl-${u.id}`);
    expect(node.x).toBeGreaterThanOrEqual(grp.x);
    expect(node.x).toBeLessThan(grp.x + grp.width);
  });

  it("buttons from before the switch to English still work (legacy callback data)", async () => {
    const h = setup();
    const u = await photo(h);
    await h.handler.handleUpdate(update("callback-brand", { __ID__: u.id, ":brand": ":kampagne" }));
    expect(readUpload(h.vault, u.id)!.level).toBe("campaign");
  });

  it("changing the level moves the brief to the trash", async () => {
    const h = setup();
    const u = await photo(h);
    await h.handler.handleUpdate(update("callback-brand", { __ID__: u.id, ":brand": ":campaign" }));
    const cb = update("callback-brand", { __ID__: u.id });
    cb.update_id = 2000;
    await h.handler.handleUpdate(cb);
    const after = readUpload(h.vault, u.id)!;
    expect(after.level).toBe("brand");
    expect(after.brief).toBeUndefined();
    expect(readdirSync(join(h.root, F, "Briefs"))).toHaveLength(0);
    expect(readdirSync(join(h.root, ".trash")).some((f) => f.includes("Brief"))).toBe(true);
  });

  it("Just keep: no analysis, no cost", async () => {
    const h = setup();
    const u = await photo(h);
    await h.handler.handleUpdate(update("callback-brand", { __ID__: u.id, ":brand": ":keep" }));
    expect(readUpload(h.vault, u.id)!.level).toBe("keep");
    expect(h.llm.calls).toHaveLength(0);
  });

  it("an analysis error lands in the note and the chat; tapping again retries", async () => {
    const h = setup();
    const u = await photo(h);
    h.llm.failNext.analysis = new LlmError("Claude: no connection.", true);
    await h.handler.handleUpdate(update("callback-brand", { __ID__: u.id }));
    expect(readUpload(h.vault, u.id)!.status).toBe("error");
    expect(h.tg.lastEdit().text).toContain("no connection");
    expect(h.tg.lastEdit().text).toContain("Tap the level again to retry.");
    const retry = update("callback-brand", { __ID__: u.id });
    retry.update_id = 3000;
    await h.handler.handleUpdate(retry);
    const after = readUpload(h.vault, u.id)!;
    expect(after.status).toBe("analyzed");
    expect(after.error).toBeUndefined();
  });

  it("ignores buttons from unknown people", async () => {
    const h = setup();
    const u = await photo(h);
    const cb = update("callback-brand", { __ID__: u.id });
    cb.callback_query!.from.id = 999;
    await h.handler.handleUpdate(cb);
    expect(readUpload(h.vault, u.id)!.level).toBe("open");
    expect(h.tg.answers[0].text).toBe("Not allowed.");
  });
});

describe("correcting and deleting", () => {
  it("a text reply to the bot message becomes a correction and triggers a new analysis", async () => {
    const h = setup();
    const u = await photo(h);
    await h.handler.handleUpdate(update("callback-brand", { __ID__: u.id }));
    await h.handler.handleUpdate(update("correction-reply"));
    const after = readUpload(h.vault, u.id)!;
    expect(after.corrections).toEqual([{ time: "2026-11-12T15:30:00", sender: "Ben", text: "I like the light more than the colour" }]);
    expect(h.llm.calls).toHaveLength(2);
    expect((h.llm.calls[1].content[1] as { text: string }).text).toContain("I like the light more");
    expect(h.tg.lastEdit().text).toContain("Correction noted, analysis updated.");
  });

  it("/delete moves note, image and brief to Obsidian's trash and removes the image from the moodboard", async () => {
    const h = setup();
    const u = await photo(h);
    await h.handler.handleUpdate(update("callback-brand", { __ID__: u.id, ":brand": ":campaign" }));
    await h.handler.handleUpdate(update("delete-reply"));
    expect(listUploads(h.vault)).toHaveLength(0);
    expect(existsSync(join(h.root, u.image))).toBe(false);
    const trash = readdirSync(join(h.root, ".trash"));
    expect(trash.some((f) => f.endsWith(`${u.id}.md`))).toBe(true);
    expect(trash.some((f) => f.endsWith(`${u.id}.jpg`))).toBe(true);
    expect(trash.some((f) => f.endsWith("Brief.md"))).toBe(true);
    const canvas = JSON.parse(readFileSync(join(h.root, F, "Moodboard.canvas"), "utf8"));
    expect(canvas.nodes.some((n: { id: string }) => n.id === `upl-${u.id}`)).toBe(false);
    expect(h.tg.sent.at(-1)!.text).toContain("deleted");
    expect(readFileSync(join(h.root, "Private.md"), "utf8")).toContain("not part of Tasteloop");
  });

  it("the German alias /löschen still works", async () => {
    const h = setup();
    await photo(h);
    await h.handler.handleUpdate(update("delete-reply", { "/delete": "/löschen" }));
    expect(listUploads(h.vault)).toHaveLength(0);
  });

  it("/delete without a reply explains how to use it", async () => {
    const h = setup();
    await photo(h);
    const del = update("delete-reply");
    delete del.message!.reply_to_message;
    await h.handler.handleUpdate(del);
    expect(listUploads(h.vault)).toHaveLength(1);
    expect(h.tg.sent.at(-1)!.text).toContain("as a reply");
  });
});

describe("long polling", () => {
  it("fetches updates, handles them and remembers the offset", async () => {
    const h = setup();
    h.tg.updates.push([update("photo-caption")]);
    const ac = new AbortController();
    const orig = h.tg.getUpdates.bind(h.tg);
    let n = 0;
    h.tg.getUpdates = async (offset: number, t: number) => {
      if (++n > 1) ac.abort();
      return orig(offset, t);
    };
    await runPolling(h.handler, h.tg, h.state, h.svc, ac.signal);
    expect(listUploads(h.vault)).toHaveLength(1);
    expect(h.state.data.offset).toBe(1002);
  });
});
