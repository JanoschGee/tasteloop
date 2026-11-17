import { notFound } from "next/navigation";
import { briefings, noteByName } from "@tasteloop/core/read";
import { Markdown } from "@/components/markdown";
import { Pill } from "@/components/pill";
import { reader } from "@/lib/vault";
import { targets } from "@/lib/targets";

export default async function BriefingPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const r = reader();
  const n = noteByName(briefings(r), decodeURIComponent(name));
  if (!n) notFound();
  return (
    <article className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap gap-2">
        <Pill tone="dark">{String(n.props.status ?? "offen")}</Pill>
        {n.props.absender ? <Pill>{String(n.props.absender)}</Pill> : null}
        {n.props.erstellt ? <Pill>{String(n.props.erstellt)}</Pill> : null}
      </div>
      <Markdown text={n.body} targets={targets(r)} />
    </article>
  );
}
