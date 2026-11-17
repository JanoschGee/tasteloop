import type { Reader } from "@tasteloop/core/read";
import type { LinkTargets } from "./markdown";

export function targets(r: Reader): LinkTargets {
  return { uploadsDir: r.vault.dirs.uploads, proposalsDir: r.vault.dirs.proposals, briefsDir: r.vault.dirs.briefs };
}
