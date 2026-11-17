import { guideBlocks } from "@tasteloop/core/read";
import { Markdown } from "@/components/markdown";
import { Pill } from "@/components/pill";
import { reader } from "@/lib/vault";
import { targets } from "@/lib/targets";

export default function GuidePage() {
  const r = reader();
  const g = guideBlocks(r);
  if (!g) return <p className="text-sm text-[var(--muted)]">Brand Guide nicht gefunden: {r.vault.guidePath}</p>;
  const t = targets(r);
  const log = r.vault.exists(r.vault.dirs.aenderungslog) ? r.vault.readText(r.vault.dirs.aenderungslog).replace(/^---[\s\S]*?---\n/, "") : "";
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-4xl font-bold tracking-[-0.035em]">{g.title}</h1>
      <p className="mt-3 text-sm text-[var(--muted)]">
        Abschnitte mit <Pill tone="outline">Kern</Pill> sind gesperrt und werden nie automatisch geändert.
      </p>
      {g.preamble.trim() && (
        <div className="mt-6">
          <Markdown text={g.preamble} targets={t} />
        </div>
      )}
      <div className="mt-6 space-y-2">
        {g.blocks.map((b) => (
          <section key={b.ref} className={b.locked ? "relative border-l-2 border-[var(--ink)] bg-[rgba(17,17,17,0.03)] px-4 py-1" : "px-4 py-1"}>
            {b.locked && b.level === 2 && <Pill tone="outline" className="absolute right-3 top-3 bg-[var(--paper)]">Kern</Pill>}
            <Markdown text={b.markdown} targets={t} />
          </section>
        ))}
      </div>
      {log && (
        <div className="mt-16 border-t border-[var(--ink)] pt-8">
          <Markdown text={log} targets={t} />
        </div>
      )}
    </div>
  );
}
