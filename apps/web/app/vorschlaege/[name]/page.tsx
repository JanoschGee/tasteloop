import { notFound } from "next/navigation";
import { digests, noteByName, proposals } from "@tasteloop/core/read";
import { Markdown } from "@/components/markdown";
import { Pill } from "@/components/pill";
import { SupportMarks } from "@/components/support";
import { reader } from "@/lib/vault";
import { targets } from "@/lib/targets";

export default async function VorschlagPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const r = reader();
  const n = noteByName([...proposals(r), ...digests(r)], decodeURIComponent(name));
  if (!n) notFound();
  return (
    <article className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap gap-2">
        {n.props.status ? <Pill tone="dark">{String(n.props.status)}</Pill> : null}
        {n.props.abschnitt ? <Pill tone="outline">{String(n.props.abschnitt)}</Pill> : null}
        {n.props.erstellt ? <Pill>{String(n.props.erstellt)}</Pill> : null}
      </div>
      {n.props.typ === "vorschlag" && (
        <div className="mb-8 border-y border-[var(--line)] py-4">
          <div className="mb-2 text-[0.7rem] uppercase tracking-[0.12em] text-[var(--muted)]">Stütze</div>
          <SupportMarks props={n.props} size="lg" />
        </div>
      )}
      <Markdown text={n.body} targets={targets(r)} />
    </article>
  );
}
