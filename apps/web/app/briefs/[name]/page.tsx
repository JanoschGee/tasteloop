import { notFound } from "next/navigation";
import { briefs, noteByName } from "@tasteloop/core/read";
import { Markdown } from "@/components/markdown";
import { Pill } from "@/components/pill";
import { targets } from "@/lib/targets";
import { reader } from "@/lib/vault";

export default async function BriefPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const r = reader();
  const n = noteByName(briefs(r), decodeURIComponent(name));
  if (!n) notFound();
  return (
    <article className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap gap-2">
        <Pill tone="dark">{String(n.props.status ?? "open")}</Pill>
        {n.props.sender ? <Pill>{String(n.props.sender)}</Pill> : null}
        {n.props.created ? <Pill>{String(n.props.created)}</Pill> : null}
      </div>
      <Markdown text={n.body} targets={targets(r)} />
    </article>
  );
}
