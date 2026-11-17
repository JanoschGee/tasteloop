import type { Reader } from "@tasteloop/core/read";
import type { LinkTargets } from "./markdown";

export function targets(r: Reader): LinkTargets {
  return { uploadsDir: r.vault.dirs.uploads, vorschlaegeDir: r.vault.dirs.vorschlaege, briefingsDir: r.vault.dirs.briefings };
}
