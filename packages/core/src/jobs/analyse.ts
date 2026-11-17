/**
 * Image analysis of an upload with Claude, then moodboard and, for campaigns, the brief.
 */
import { extname } from "node:path";
import { guideExcerpt } from "../guide/context";
import { costUsd, type LlmContent } from "../llm/client";
import { AnalysisSchema, analysisSystem, analysisUserText } from "../llm/prompts";
import type { Services } from "../services";
import { upsertCanvasImage } from "../vault/canvas";
import { LEVEL_LABEL, readUpload, writeUpload, type Upload } from "../vault/uploads";
import { createBrief } from "./briefing";

export function mediaTypeOf(path: string): "image/jpeg" | "image/png" | "image/webp" | "image/gif" {
  const e = extname(path).toLowerCase();
  if (e === ".png") return "image/png";
  if (e === ".webp") return "image/webp";
  if (e === ".gif") return "image/gif";
  return "image/jpeg";
}

export function imageContent(svc: Services, image: string): LlmContent {
  return { type: "image", mediaType: mediaTypeOf(image), base64: svc.vault.readBytes(image).toString("base64") };
}

export interface AnalysisResult {
  upload: Upload;
  brief?: string;
  costUsd?: number;
}

export function userTextFor(u: Upload, level: string): string {
  return analysisUserText({ sender: u.sender, why: u.why, transcript: u.transcript, corrections: u.corrections.map((k) => k.text), level });
}

/** Analyses (or refreshes) an upload. Never throws: errors end up in the note. */
export async function analyseUpload(svc: Services, id: string): Promise<AnalysisResult> {
  const v = svc.vault;
  const u = readUpload(v, id);
  if (!u) throw new Error(`Upload ${id} not found`);
  upsertCanvasImage(v, u.id, u.image, u.level);
  if (u.level === "open" || (u.level === "keep" && !svc.cfg.analyze_keep)) {
    u.status = u.level === "keep" ? "analyzed" : u.status;
    writeUpload(v, u);
    return { upload: u };
  }
  u.status = "processing";
  u.error = undefined;
  writeUpload(v, u);
  let cost = 0;
  try {
    const { data, usage } = await svc.llm.structured({
      purpose: "analysis",
      model: svc.cfg.models.analysis,
      system: analysisSystem(svc.cfg.brand.name, guideExcerpt(v), svc.cfg.language),
      content: [imageContent(svc, u.image), { type: "text", text: userTextFor(u, LEVEL_LABEL[u.level]) }],
      schema: AnalysisSchema,
      effort: "medium",
    });
    cost += costUsd(usage) ?? 0;
    u.analysis = data;
    u.status = u.digest ? "in_digest" : "analyzed";
    writeUpload(v, u);
    svc.log.info("Analysis done", { id, input: usage.inputTokens, output: usage.outputTokens, cacheRead: usage.cacheReadTokens, cacheWrite: usage.cacheWriteTokens, costUsd: costUsd(usage) });
  } catch (err) {
    u.status = "error";
    u.error = `Analysis failed (${svc.now().toISOString()}): ${err instanceof Error ? err.message : String(err)}`;
    writeUpload(v, u);
    svc.log.error("Analysis failed", { id, error: u.error });
    return { upload: u, costUsd: cost };
  }
  let brief: string | undefined;
  if (u.level === "campaign") {
    try {
      const r = await createBrief(svc, u);
      brief = r.path;
      cost += r.costUsd ?? 0;
      u.brief = brief;
      writeUpload(v, u);
    } catch (err) {
      u.error = `Brief failed: ${err instanceof Error ? err.message : String(err)}`;
      writeUpload(v, u);
      svc.log.error("Brief failed", { id, error: u.error });
    }
  }
  return { upload: u, brief, costUsd: cost };
}
