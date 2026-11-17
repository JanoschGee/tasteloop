import Link from "next/link";
import { digests, proposals } from "@tasteloop/core/read";
import { PencilCircle } from "@/components/pencil-circle";
import { Pill } from "@/components/pill";
import { SupportMarks } from "@/components/support";
import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid";
import { imageUrl, reader } from "@/lib/vault";

/** open first, then by support (different people, then references) */
const bySupport = (a: { props: Record<string, unknown> }, b: { props: Record<string, unknown> }) =>
  Number(b.props.support_people ?? 0) - Number(a.props.support_people ?? 0) || Number(b.props.support_refs ?? 0) - Number(a.props.support_refs ?? 0);

const ORDER: Record<string, number> = { open: 0, approved: 1, conflict: 2, locked: 3, error: 4, applied: 5, rejected: 6 };
const ACCEPTED = new Set(["applied", "approved"]);

export default function ProposalsPage() {
  const r = reader();
  const list = proposals(r).sort((a, b) => (ORDER[String(a.props.status)] ?? 9) - (ORDER[String(b.props.status)] ?? 9) || bySupport(a, b) || b.name.localeCompare(a.name));
  const ds = digests(r);
  const open = list.filter((p) => p.props.status === "open").length;
  return (
    <div>
      <h1 className="text-4xl font-bold tracking-[-0.035em]">Proposals</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        {open} open · approve in Obsidian with the property <code>status: approved</code>
      </p>
      {list.length ? (
        <BentoGrid className="mt-8">
          {list.map((p) => (
            <Link key={p.path} href={`/proposals/${encodeURIComponent(p.name)}`} className="contents">
              <BentoGridItem
                header={
                  p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl(p.image)} alt="" className="h-40 w-full bg-[#eeebe4] object-cover" />
                  ) : (
                    <div className="h-40 w-full bg-[#eeebe4]" />
                  )
                }
                icon={<Pill tone={p.props.status === "open" ? "dark" : ACCEPTED.has(String(p.props.status)) ? "pencil" : "neutral"}>{String(p.props.status)}</Pill>}
                title={String(p.props.title ?? p.name)}
                description={
                  <div className="space-y-2">
                    <div>{`${String(p.props.section ?? "")} · ${String(p.props.change ?? "extend")}`}</div>
                    <SupportMarks props={p.props} />
                  </div>
                }
                overlay={ACCEPTED.has(String(p.props.status)) ? <PencilCircle seed={p.path} style={{ left: "-4%", top: "-3%", width: "108%", height: "106%" }} /> : null}
              />
            </Link>
          ))}
        </BentoGrid>
      ) : (
        <p className="font-hand mt-8 text-xl text-[var(--muted)]">No proposals yet. The weekly digest writes them on Mondays.</p>
      )}
      {ds.length > 0 && (
        <div className="mt-14">
          <h2 className="text-lg font-bold tracking-[-0.02em]">Weekly digests</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {ds.map((d) => (
              <li key={d.path}>
                <Link href={`/proposals/${encodeURIComponent(d.name)}`} className="underline decoration-[var(--pencil)] underline-offset-4">
                  {d.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
