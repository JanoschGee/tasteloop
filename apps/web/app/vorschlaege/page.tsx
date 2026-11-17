import Link from "next/link";
import { digests, proposals } from "@tasteloop/core/read";
import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid";
import { Pill } from "@/components/pill";
import { PencilCircle } from "@/components/pencil-circle";
import { SupportMarks } from "@/components/support";
import { imageUrl, reader } from "@/lib/vault";

/** offen zuerst, darin nach Stütze (verschiedene Personen, dann Belege) */
const byStuetze = (a: { props: Record<string, unknown> }, b: { props: Record<string, unknown> }) =>
  Number(b.props.stuetze_personen ?? 0) - Number(a.props.stuetze_personen ?? 0) || Number(b.props.stuetze_belege ?? 0) - Number(a.props.stuetze_belege ?? 0);

const ORDER: Record<string, number> = { offen: 0, freigegeben: 1, konflikt: 2, gesperrt: 3, fehler: 4, übernommen: 5, abgelehnt: 6 };

export default function VorschlaegePage() {
  const r = reader();
  const list = proposals(r).sort((a, b) => (ORDER[String(a.props.status)] ?? 9) - (ORDER[String(b.props.status)] ?? 9) || byStuetze(a, b) || b.name.localeCompare(a.name));
  const ds = digests(r);
  const offen = list.filter((p) => p.props.status === "offen").length;
  return (
    <div>
      <h1 className="text-4xl font-bold tracking-[-0.035em]">Vorschläge</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        {offen} offen · Freigabe in Obsidian über die Property <code>status: freigegeben</code>
      </p>
      {list.length ? (
        <BentoGrid className="mt-8">
          {list.map((p) => (
            <Link key={p.path} href={`/vorschlaege/${encodeURIComponent(p.name)}`} className="contents">
              <BentoGridItem
                header={
                  p.bild ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl(p.bild)} alt="" className="h-40 w-full bg-[#eeebe4] object-cover" />
                  ) : (
                    <div className="h-40 w-full bg-[#eeebe4]" />
                  )
                }
                icon={<Pill tone={p.props.status === "offen" ? "dark" : p.props.status === "übernommen" || p.props.status === "freigegeben" ? "pencil" : "neutral"}>{String(p.props.status)}</Pill>}
                overlay={
                  p.props.status === "übernommen" || p.props.status === "freigegeben" ? (
                    <PencilCircle seed={p.path} style={{ left: "-4%", top: "-3%", width: "108%", height: "106%" }} />
                  ) : null
                }
                title={String(p.props.titel ?? p.name)}
                description={
                  <div className="space-y-2">
                    <div>{`${String(p.props.abschnitt ?? "")} · ${p.props.art === "ersetzen" ? "ersetzen" : "ergänzen"}`}</div>
                    <SupportMarks props={p.props} />
                  </div>
                }
              />
            </Link>
          ))}
        </BentoGrid>
      ) : (
        <p className="font-hand mt-8 text-xl text-[var(--muted)]">Noch keine Vorschläge. Der Wochen-Digest legt sie montags an.</p>
      )}
      {ds.length > 0 && (
        <div className="mt-14">
          <h2 className="text-lg font-bold tracking-[-0.02em]">Wochen-Digests</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {ds.map((d) => (
              <li key={d.path}>
                <Link href={`/vorschlaege/${encodeURIComponent(d.name)}`} className="underline decoration-[var(--pencil)] underline-offset-4">
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
