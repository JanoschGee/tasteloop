/**
 * Integrationstest: Telegram-Updates (Fixtures) -> Notizen, Bilder, Moodboard, Briefing im Vault.
 * Telegram, Claude und Transkription sind gemockt.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMd } from "../src/frontmatter";
import { LlmError } from "../src/llm/client";
import { BotState } from "../src/state";
import { runPolling, TelegramHandler } from "../src/telegram/handler";
import { listUploads, readUpload } from "../src/vault/uploads";
import { FakeTelegram, FakeTranscriber, makeServices, update } from "./helpers";

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

describe("Bild erfassen", () => {
  it("legt Bild und Notiz mit Properties an und fragt per Knöpfen nach der Ebene", async () => {
    const h = setup();
    const u = await photo(h);
    expect(u.id).toMatch(/^20261112-1530-[0-9a-f]{4}$/);
    expect(u.ebene).toBe("offen");
    expect(u.absender).toBe("Anna");
    expect(u.status).toBe("neu");
    expect(u.begruendung).toContain("Farbwelt");
    expect(u.vorgeschlageneEbene).toBe("brand");
    // Bild liegt im Vault-Unterordner
    expect(u.bild).toBe(`Marke/Brand-System/Uploads/Bilder/${u.id}.jpg`);
    expect(existsSync(join(h.root, u.bild))).toBe(true);
    // Notiz hat Obsidian-Properties und eingebettetes Bild
    const note = readFileSync(join(h.root, "Marke/Brand-System/Uploads", `${u.id}.md`), "utf8");
    const { props, body } = parseMd(note);
    expect(props).toMatchObject({ typ: "upload", ebene: "offen", absender: "Anna", status: "neu", marke: "Testmarke", bild: `[[${u.bild}]]` });
    expect(props.datum).toBe("2026-11-12T15:30:00");
    expect(body).toContain(`![[${u.bild}]]`);
    // Antwort mit drei Knöpfen, Vorschlag markiert
    const msg = h.tg.sent[0];
    expect(msg.replyTo).toBe(10);
    expect(msg.keyboard![0].map((b) => b.text)).toEqual(["👉 Brand", "Kampagne", "Nur merken"]);
    expect(msg.keyboard![0].map((b) => b.callback_data)).toEqual([`lvl:${u.id}:brand`, `lvl:${u.id}:kampagne`, `lvl:${u.id}:merken`]);
    // Moodboard enthält das Bild in der Gruppe „Offen“
    const canvas = JSON.parse(readFileSync(join(h.root, "Marke/Brand-System/Moodboard.canvas"), "utf8"));
    expect(canvas.nodes.find((n: { id: string }) => n.id === `upl-${u.id}`).file).toBe(u.bild);
    // noch kein Claude-Aufruf
    expect(h.llm.calls).toHaveLength(0);
  });

  it("nimmt auch Bilder als Datei an und schlägt Kampagne vor", async () => {
    const h = setup();
    await h.handler.handleUpdate(update("document-image-campaign"));
    const [u] = listUploads(h.vault);
    expect(u.bild.endsWith(".png")).toBe(true);
    expect(u.absender).toBe("Ben");
    expect(u.vorgeschlageneEbene).toBe("kampagne");
  });

  it("ignoriert fremde Chats und unbekannte Absender", async () => {
    const h = setup();
    await h.handler.handleUpdate(update("foreign-chat"));
    await h.handler.handleUpdate(update("unknown-sender"));
    expect(listUploads(h.vault)).toHaveLength(0);
    expect(h.tg.sent).toHaveLength(0);
  });

  it("verarbeitet dasselbe Update nur einmal", async () => {
    const h = setup();
    await h.handler.handleUpdate(update("photo-caption"));
    await h.handler.handleUpdate(update("photo-caption"));
    expect(listUploads(h.vault)).toHaveLength(1);
    expect(h.state.data.offset).toBe(1002);
  });
});

describe("Sprachnachricht", () => {
  it("transkribiert die Antwort auf das Bild und schreibt sie in die Notiz", async () => {
    const t = new FakeTranscriber("Nimm das für die Kampagne, so eine Anzeige brauchen wir");
    const h = setup({ transcriber: t });
    const u = await photo(h);
    await h.handler.handleUpdate(update("voice-reply"));
    const after = readUpload(h.vault, u.id)!;
    expect(after.transkript).toEqual(["Nimm das für die Kampagne, so eine Anzeige brauchen wir"]);
    expect(after.vorgeschlageneEbene).toBe("kampagne");
    expect(h.tg.lastEdit().text).toContain("Vorschlag: Kampagne");
    expect(h.tg.lastEdit().keyboard![0][1].text).toBe("👉 Kampagne");
  });

  it("ordnet eine Sprachnachricht ohne Antwort-Bezug dem letzten Bild desselben Absenders zu", async () => {
    const h = setup();
    const u = await photo(h);
    const voice = update("voice-reply");
    delete voice.message!.reply_to_message;
    await h.handler.handleUpdate(voice);
    expect(readUpload(h.vault, u.id)!.transkript).toHaveLength(1);
  });

  it("meldet einen Transkriptionsfehler im Chat, ohne abzustürzen", async () => {
    const h = setup({ transcriber: new FakeTranscriber("", true) });
    const u = await photo(h);
    await h.handler.handleUpdate(update("voice-reply"));
    expect(readUpload(h.vault, u.id)!.transkript).toHaveLength(0);
    expect(h.tg.sent.at(-1)!.text).toContain("nicht transkribiert");
  });
});

describe("Ebene wählen und analysieren", () => {
  it("Brand: Claude analysiert Bild plus Transkript, Notiz wird ergänzt", async () => {
    const h = setup();
    const u = await photo(h);
    await h.handler.handleUpdate(update("voice-reply"));
    await h.handler.handleUpdate(update("callback-brand", { __ID__: u.id }));
    const after = readUpload(h.vault, u.id)!;
    expect(after.ebene).toBe("brand");
    expect(after.status).toBe("analysiert");
    expect(after.analyse?.gefaellt).toContain("Warmes Seitenlicht");
    expect(after.analyse?.stilmerkmale.farbe).toContain("Terrakotta #C8643B");
    // Claude bekam das Bild und den Text
    const call = h.llm.calls[0];
    expect(call.purpose).toBe("analyse");
    expect(call.model).toBe("claude-sonnet-5-5");
    expect(call.content[0]).toMatchObject({ type: "image", mediaType: "image/jpeg" });
    expect((call.content[1] as { text: string }).text).toContain("Das Licht ist super");
    // Kontext ist nur der konfigurierte Guide-Abschnitt, Markenname aus der Config
    expect(call.system).toContain("Testmarke");
    expect(call.system).toContain("Echte Menschen, kein Stock.");
    expect(call.system).not.toContain("mutig und warm");
    // Knopf bestätigt, Nachricht zeigt Ebene
    expect(h.tg.answers[0]).toEqual({ id: "cb-1", text: "Ebene: Brand" });
    expect(h.tg.lastEdit().text).toContain("Ebene: Brand");
    expect(h.tg.lastEdit().keyboard![0][0].text).toBe("✅ Brand");
    // Properties für die Bases-Galerie
    const { props } = parseMd(readFileSync(join(h.root, "Marke/Brand-System/Uploads", `${u.id}.md`), "utf8"));
    expect(props.stil).toEqual(["warm", "analog", "filmkorn"]);
    // kein Briefing bei Brand
    expect(after.briefing).toBeUndefined();
  });

  it("Kampagne: erzeugt zusätzlich ein Briefing mit Referenzbild, Grenzen und fester Grundregel", async () => {
    const h = setup();
    const u = await photo(h);
    await h.handler.handleUpdate(update("callback-brand", { __ID__: u.id, ":brand": ":kampagne" }));
    const after = readUpload(h.vault, u.id)!;
    expect(after.ebene).toBe("kampagne");
    expect(after.briefing).toBe(`Marke/Brand-System/Briefings/${u.id} Briefing.md`);
    const text = readFileSync(join(h.root, after.briefing!), "utf8");
    const { props, body } = parseMd(text);
    expect(props).toMatchObject({ typ: "briefing", status: "offen", referenzbild: `[[${u.bild}]]` });
    expect(body).toContain("Stil der Referenz, Identität von Testmarke.");
    expect(body).toContain("Fremde Motive, Claims, Figuren und Layouts werden nie 1:1 übernommen");
    expect(body).toContain(`![[${u.bild}]]`);
    expect(body).toContain("**3. Look and Feel > Bildwelt:** Echte Menschen, kein Stock.");
    expect(body).toContain("Das Paar-Motiv der Referenz");
    // Briefing-Prompt bekam den ganzen Guide
    const bcall = h.llm.calls.find((c) => c.purpose === "briefing")!;
    expect(bcall.system).toContain("mutig und warm");
    // Moodboard: Bild in Gruppe Kampagne
    const canvas = JSON.parse(readFileSync(join(h.root, "Marke/Brand-System/Moodboard.canvas"), "utf8"));
    const grp = canvas.nodes.find((n: { id: string }) => n.id === "grp-kampagne");
    const node = canvas.nodes.find((n: { id: string }) => n.id === `upl-${u.id}`);
    expect(node.x).toBeGreaterThanOrEqual(grp.x);
    expect(node.x).toBeLessThan(grp.x + grp.width);
  });

  it("Ebene wechseln: Briefing wandert in den Papierkorb", async () => {
    const h = setup();
    const u = await photo(h);
    await h.handler.handleUpdate(update("callback-brand", { __ID__: u.id, ":brand": ":kampagne" }));
    const cb = update("callback-brand", { __ID__: u.id });
    cb.update_id = 2000;
    await h.handler.handleUpdate(cb);
    const after = readUpload(h.vault, u.id)!;
    expect(after.ebene).toBe("brand");
    expect(after.briefing).toBeUndefined();
    expect(readdirSync(join(h.root, "Marke/Brand-System/Briefings"))).toHaveLength(0);
    expect(readdirSync(join(h.root, ".trash")).some((f) => f.includes("Briefing"))).toBe(true);
  });

  it("Nur merken: keine Analyse, keine Kosten", async () => {
    const h = setup();
    const u = await photo(h);
    await h.handler.handleUpdate(update("callback-brand", { __ID__: u.id, ":brand": ":merken" }));
    expect(readUpload(h.vault, u.id)!.ebene).toBe("merken");
    expect(h.llm.calls).toHaveLength(0);
  });

  it("Analysefehler landet in der Notiz und im Chat; erneutes Tippen wiederholt", async () => {
    const h = setup();
    const u = await photo(h);
    h.llm.failNext.analyse = new LlmError("Claude: keine Verbindung.", true);
    await h.handler.handleUpdate(update("callback-brand", { __ID__: u.id }));
    expect(readUpload(h.vault, u.id)!.status).toBe("fehler");
    expect(h.tg.lastEdit().text).toContain("keine Verbindung");
    const retry = update("callback-brand", { __ID__: u.id });
    retry.update_id = 3000;
    await h.handler.handleUpdate(retry);
    const after = readUpload(h.vault, u.id)!;
    expect(after.status).toBe("analysiert");
    expect(after.fehler).toBeUndefined();
  });

  it("ignoriert Knöpfe von Unbekannten", async () => {
    const h = setup();
    const u = await photo(h);
    const cb = update("callback-brand", { __ID__: u.id });
    cb.callback_query!.from.id = 999;
    await h.handler.handleUpdate(cb);
    expect(readUpload(h.vault, u.id)!.ebene).toBe("offen");
    expect(h.tg.answers[0].text).toBe("Nicht freigeschaltet.");
  });
});

describe("Korrektur und Löschen", () => {
  it("Text-Antwort auf die Bot-Bestätigung wird Korrektur und löst neue Analyse aus", async () => {
    const h = setup();
    const u = await photo(h);
    await h.handler.handleUpdate(update("callback-brand", { __ID__: u.id }));
    await h.handler.handleUpdate(update("correction-reply"));
    const after = readUpload(h.vault, u.id)!;
    expect(after.korrekturen).toEqual([{ zeit: "2026-11-12T15:30:00", absender: "Ben", text: "Mir gefällt eher das Licht als die Farbe" }]);
    expect(h.llm.calls).toHaveLength(2);
    expect((h.llm.calls[1].content[1] as { text: string }).text).toContain("Mir gefällt eher das Licht");
  });

  it("/löschen verschiebt Notiz, Bild und Briefing in den Obsidian-Papierkorb und entfernt das Bild vom Moodboard", async () => {
    const h = setup();
    const u = await photo(h);
    await h.handler.handleUpdate(update("callback-brand", { __ID__: u.id, ":brand": ":kampagne" }));
    await h.handler.handleUpdate(update("delete-reply"));
    expect(listUploads(h.vault)).toHaveLength(0);
    expect(existsSync(join(h.root, u.bild))).toBe(false);
    const trash = readdirSync(join(h.root, ".trash"));
    expect(trash.some((f) => f.endsWith(`${u.id}.md`))).toBe(true);
    expect(trash.some((f) => f.endsWith(`${u.id}.jpg`))).toBe(true);
    expect(trash.some((f) => f.endsWith("Briefing.md"))).toBe(true);
    const canvas = JSON.parse(readFileSync(join(h.root, "Marke/Brand-System/Moodboard.canvas"), "utf8"));
    expect(canvas.nodes.some((n: { id: string }) => n.id === `upl-${u.id}`)).toBe(false);
    expect(h.tg.sent.at(-1)!.text).toContain("gelöscht");
    // andere Dateien im Vault unberührt
    expect(readFileSync(join(h.root, "Fremd.md"), "utf8")).toContain("gehört nicht");
  });

  it("/löschen ohne Antwort-Bezug erklärt die Bedienung", async () => {
    const h = setup();
    await photo(h);
    const del = update("delete-reply");
    delete del.message!.reply_to_message;
    await h.handler.handleUpdate(del);
    expect(listUploads(h.vault)).toHaveLength(1);
    expect(h.tg.sent.at(-1)!.text).toContain("als Antwort");
  });
});

describe("Long Polling", () => {
  it("holt Updates ab, verarbeitet sie und merkt sich den Offset", async () => {
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
