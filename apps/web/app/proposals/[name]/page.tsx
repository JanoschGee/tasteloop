import { notFound } from "next/navigation";
import { digests, noteByName, proposals } from "@tasteloop/core/read";
import { Markdown } from "@/components/markdown";
import { Pill } from "@/components/pill";
import { SupportMarks } from "@/components/support";
import { targets } from "@/lib/targets";
import { reader } from "@/lib/vault";

export default async function ProposalPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const r = reader();
  const n = noteByName([...proposals(r), ...digests(r)], decodeURIComponent(name));
  if (!n) notFound();
  return (
    <article className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap gap-2">
        {n.props.status ? <Pill tone="dark">{String(n.props.status)}</Pill> : null}
        {n.props.section ? <Pill tone="outline">{String(n.props.section)}</Pill> : null}
        {n.props.created ? <Pill>{String(n.props.created)}</Pill> : null}
      </div>
      {n.props.type === "proposal" && (
        <div className="mb-8 border-y border-[var(--line)] py-4">
          <div className="mb-2 text-[0.7rem] uppercase tracking-[0.12em] text-[var(--muted)]">Support</div>
          <SupportMarks props={n.props} size="lg" />
        </div>
      )}
      <Markdown text={n.body} targets={targets(r)} />
    </article>
  );
}
