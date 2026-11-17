/**
 * Applies approved proposals to the brand guide.
 *
 * Safety net (in this order):
 *  1. only status: approved (and approved_by from the approvers list, if configured)
 *  2. disputed proposals only with dispute_resolved: true
 *  3. the target section is not locked and lies in the learning area (otherwise status: locked)
 *  4. for "replace": the section is unchanged since the proposal (otherwise status: conflict)
 *  5. applyChange() checks hard: nothing but the target section changes
 *  6. changelog row in the guide and version +1; then a full check against a fresh read of the file
 *     (allowed: target section, changelog section and the free frontmatter keys)
 *  7. backup of the old version outside the vault, entry in the changelog note
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseMd, stringifyMd } from "../frontmatter";
import { lockRules, readGuide } from "../guide/context";
import {
  appendChangelogRow,
  applyChange,
  assertGuideIntegrity,
  bumpFrontmatter,
  ChangeError,
  findSection,
  hash,
  isEditable,
  isLocked,
  LockedSectionError,
  ownBody,
  parseGuide,
  sectionRef,
  type ChangeKind,
} from "../guide/sections";
import type { Services } from "../services";
import { localDate, localIso } from "../util";
import { NEW_TEXT_END, NEW_TEXT_START } from "./digest";

export type ApplyStatus = "applied" | "locked" | "conflict" | "error" | "not_allowed" | "disputed";

export interface ApplyResult {
  path: string;
  title: string;
  status: ApplyStatus;
  message: string;
}

export function extractNewText(body: string): string | undefined {
  const a = body.indexOf(NEW_TEXT_START);
  const b = body.indexOf(NEW_TEXT_END);
  if (a < 0 || b < 0 || b < a) return undefined;
  return body.slice(a + NEW_TEXT_START.length, b).trim();
}

function setStatus(svc: Services, path: string, status: string, message: string, extra: Record<string, unknown> = {}) {
  const doc = parseMd(svc.vault.readText(path));
  doc.props.status = status;
  Object.assign(doc.props, extra);
  const note = `\n> [!${status === "applied" ? "success" : "warning"}] ${status} (${localIso(svc.now()).replace("T", " ").slice(0, 16)})\n> ${message}\n`;
  doc.body = doc.body.replace(/\n## Log\n[\s\S]*$/, "") + `\n## Log\n${note}`;
  svc.vault.writeText(path, stringifyMd(doc));
}

export function runApply(svc: Services, opts: { backupDir?: string } = {}): ApplyResult[] {
  const v = svc.vault;
  const rules = lockRules(v);
  const results: ApplyResult[] = [];
  const approvers = svc.cfg.approvers.map((x) => x.trim().toLowerCase());

  for (const path of v.listMd(v.dirs.proposals)) {
    const doc = parseMd(v.readText(path));
    if (doc.props.type !== "proposal" || doc.props.status !== "approved") continue;
    const title = String(doc.props.title ?? path);
    const done = (status: ApplyStatus, message: string, extra: Record<string, unknown> = {}) => {
      setStatus(svc, path, status, message, extra);
      results.push({ path, title, status, message });
      svc.log.info(`Proposal ${status}`, { path, message });
    };

    const by = String(doc.props.approved_by ?? "").trim();
    if (approvers.length && !approvers.includes(by.toLowerCase())) {
      // status stays "approved": once the name is fixed, the next run applies it
      results.push({ path, title, status: "not_allowed", message: `approved_by "${by}" is not in the approvers list` });
      continue;
    }

    // disputed points never become rules quietly: resolve first, then dispute_resolved: true
    if (Number(doc.props.disputed ?? 0) > 0 && doc.props.dispute_resolved !== true) {
      results.push({ path, title, status: "disputed", message: "People disagree here. Resolve it and set dispute_resolved: true." });
      continue;
    }

    const section = String(doc.props.section ?? "");
    const change: ChangeKind = doc.props.change === "replace" ? "replace" : "extend";
    const text = extractNewText(doc.body);
    if (!text) {
      done("error", "No new text found between the markers.");
      continue;
    }

    let guide: string;
    try {
      guide = readGuide(v);
    } catch (err) {
      done("error", String(err instanceof Error ? err.message : err));
      continue;
    }
    const g = parseGuide(guide);
    const s = findSection(g, section);
    if (!s) {
      done("error", `Section "${section}" not found (unambiguously) in the guide.`);
      continue;
    }
    if (isLocked(s, rules, g)) {
      done("locked", `"${section}" is a locked core section and is never changed automatically. Change it by hand if needed.`);
      continue;
    }
    if (!isEditable(s, rules, g)) {
      done("locked", `"${section}" is outside the learning area and is not changed automatically.`);
      continue;
    }
    if (change === "replace" && doc.props.base_hash && hash(ownBody(g, s)) !== doc.props.base_hash) {
      done("conflict", "The section changed since the proposal was written. Check it and approve again (delete base_hash to force it).");
      continue;
    }

    let next: string;
    try {
      next = applyChange(guide, { section, change, text }, rules);
      const allowed = [sectionRef(s)];
      const changelog = svc.cfg.guide.changelog_section;
      if (changelog) {
        next = appendChangelogRow(next, changelog, {
          date: localDate(svc.now()),
          part: sectionRef(s).split(" > ").pop()!,
          change: `${title} (${change === "replace" ? "replaced" : "extended"})`,
          evidence: `[[${path.replace(/\.md$/, "")}|Proposal]]`,
          approvedBy: by || "–",
        });
        const cs = findSection(parseGuide(next), changelog);
        if (cs) allowed.push(sectionRef(cs));
      }
      next = bumpFrontmatter(next, svc.cfg.guide.version_key, svc.cfg.guide.date_key, localDate(svc.now()));
      // second, independent full check right before writing, against the current file
      assertGuideIntegrity(readGuide(v), next, rules, allowed);
    } catch (err) {
      if (err instanceof LockedSectionError) done("locked", err.message);
      else if (err instanceof ChangeError) done("error", err.message);
      else done("error", String(err instanceof Error ? err.message : err));
      continue;
    }

    if (opts.backupDir) {
      mkdirSync(opts.backupDir, { recursive: true });
      copyFileSync(v.abs(v.guidePath), join(opts.backupDir, `${localIso(svc.now()).replace(/[:T]/g, "-")} ${v.guidePath.split("/").pop()}`));
    }
    v.writeText(v.guidePath, next);
    appendChangelogNote(svc, { title, section, change, path, by });
    done("applied", `Applied to "${section}" (${change === "replace" ? "replaced" : "extended"}).`, { applied_at: localIso(svc.now()) });
  }
  return results;
}

function appendChangelogNote(svc: Services, e: { title: string; section: string; change: string; path: string; by: string }) {
  const v = svc.vault;
  const p = v.dirs.changelog;
  const existing = v.exists(p) ? v.readText(p) : `---\ntype: changelog\n---\n\n# Brand guide changelog\n`;
  const entry = `- ${localIso(svc.now()).replace("T", " ").slice(0, 16)}: **${e.title}** in "${e.section}" (${e.change}${e.by ? `, approved by ${e.by}` : ""}) → [[${e.path.replace(/\.md$/, "")}]]`;
  // older changelog notes use a German marker
  const MARK = existing.includes("<!-- einträge -->") ? "<!-- einträge -->" : "<!-- entries -->";
  const base = existing.includes(MARK) ? existing : `${existing.trimEnd()}\n\n${MARK}\n`;
  v.writeText(p, base.replace(MARK, `${MARK}\n${entry}`).replace(/\n{3,}/g, "\n\n"));
}

export function applyChatText(results: ApplyResult[]): string | undefined {
  const relevant = results.filter((r) => r.status !== "not_allowed" && r.status !== "disputed");
  if (!relevant.length) return undefined;
  const icon: Record<ApplyStatus, string> = { applied: "✅", locked: "🔒", conflict: "⚠️", error: "❌", not_allowed: "⛔", disputed: "⚖️" };
  return ["Brand guide:", ...relevant.map((r) => `${icon[r.status]} ${r.title}: ${r.message}`)].join("\n");
}
