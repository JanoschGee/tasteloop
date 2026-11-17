/**
 * Bildanalyse eines Uploads mit Claude, danach Moodboard und ggf. Briefing.
 */
import { extname } from "node:path";
import { guideExcerpt } from "../guide/context";
import { kostenUsd, type LlmContent } from "../llm/client";
import { AnalyseSchema, analyseSystem, analyseUserText } from "../llm/prompts";
import type { Services } from "../services";
import { upsertCanvasImage } from "../vault/canvas";
import { EBENEN_LABEL, readUpload, writeUpload, type Upload } from "../vault/uploads";
import { createBriefing } from "./briefing";

export function mediaTypeOf(path: string): "image/jpeg" | "image/png" | "image/webp" | "image/gif" {
  const e = extname(path).toLowerCase();
  if (e === ".png") return "image/png";
  if (e === ".webp") return "image/webp";
  if (e === ".gif") return "image/gif";
  return "image/jpeg";
}

export function imageContent(svc: Services, bild: string): LlmContent {
  return { type: "image", mediaType: mediaTypeOf(bild), base64: svc.vault.readBytes(bild).toString("base64") };
}

export interface AnalyseErgebnis {
  upload: Upload;
  briefing?: string;
  kostenUsd?: number;
}

/** Analysiert (bzw. aktualisiert) einen Upload. Wirft nicht: Fehler landen in der Notiz. */
export async function analyseUpload(svc: Services, id: string): Promise<AnalyseErgebnis> {
  const v = svc.vault;
  const u = readUpload(v, id);
  if (!u) throw new Error(`Upload ${id} nicht gefunden`);
  upsertCanvasImage(v, u.id, u.bild, u.ebene);
  if (u.ebene === "offen" || (u.ebene === "merken" && !svc.cfg.analyse_bei_merken)) {
    u.status = u.ebene === "merken" ? "analysiert" : u.status;
    writeUpload(v, u);
    return { upload: u };
  }
  u.status = "in-arbeit";
  u.fehler = undefined;
  writeUpload(v, u);
  let kosten = 0;
  try {
    const { data, usage } = await svc.llm.structured({
      purpose: "analyse",
      model: svc.cfg.modelle.analyse,
      system: analyseSystem(svc.cfg.marke.name, guideExcerpt(v)),
      content: [
        imageContent(svc, u.bild),
        {
          type: "text",
          text: analyseUserText({
            absender: u.absender,
            begruendung: u.begruendung,
            transkript: u.transkript,
            korrekturen: u.korrekturen.map((k) => k.text),
            ebene: EBENEN_LABEL[u.ebene],
          }),
        },
      ],
      schema: AnalyseSchema,
      effort: "medium",
    });
    kosten += kostenUsd(usage) ?? 0;
    u.analyse = data;
    u.status = u.digest ? "im-digest" : "analysiert";
    writeUpload(v, u);
    svc.log.info("Analyse fertig", { id, eingabe: usage.inputTokens, ausgabe: usage.outputTokens, cacheLesen: usage.cacheReadTokens, cacheSchreiben: usage.cacheWriteTokens, kostenUsd: kostenUsd(usage) });
  } catch (err) {
    u.status = "fehler";
    u.fehler = `Analyse fehlgeschlagen (${svc.now().toISOString()}): ${err instanceof Error ? err.message : String(err)}`;
    writeUpload(v, u);
    svc.log.error("Analyse fehlgeschlagen", { id, fehler: u.fehler });
    return { upload: u, kostenUsd: kosten };
  }
  let briefing: string | undefined;
  if (u.ebene === "kampagne") {
    try {
      const r = await createBriefing(svc, u);
      briefing = r.path;
      kosten += r.kostenUsd ?? 0;
      u.briefing = briefing;
      writeUpload(v, u);
    } catch (err) {
      u.fehler = `Briefing fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`;
      writeUpload(v, u);
      svc.log.error("Briefing fehlgeschlagen", { id, fehler: u.fehler });
    }
  }
  return { upload: u, briefing, kostenUsd: kosten };
}
