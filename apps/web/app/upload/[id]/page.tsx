import Link from "next/link";
import { notFound } from "next/navigation";
import { acceptedUploadIds, EBENEN_LABEL, upload } from "@tasteloop/core/read";
import { Pill } from "@/components/pill";
import { MarginNote } from "@/components/margin-note";
import { PencilCircle } from "@/components/pencil-circle";
import { formatDatum, imageUrl, reader } from "@/lib/vault";

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-2 space-y-1 text-sm">
        {items.map((x, i) => (
          <li key={i}>– {x}</li>
        ))}
      </ul>
    </div>
  );
}

export default async function UploadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = reader();
  const u = upload(r, decodeURIComponent(id));
  if (!u) notFound();
  const imGuide = acceptedUploadIds(r).has(u.id);
  const a = u.analyse;
  const stil = a ? Object.entries(a.stilmerkmale).filter(([, v]) => v.length) : [];
  const stilLabel: Record<string, string> = { farbe: "Farbe", licht: "Licht", komposition: "Komposition", typografie: "Typografie", material_textur: "Material und Textur", stimmung: "Stimmung" };

  return (
    <article className="grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div>
        <div className="relative border border-[var(--line)] bg-[var(--card)] p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl(u.bild)} alt={a?.kurzbeschreibung ?? u.id} className="w-full bg-[#eeebe4]" />
          {imGuide && <PencilCircle seed={u.id} style={{ left: "-5%", top: "-4%", width: "110%", height: "108%" }} />}
        </div>
        {imGuide && <p className="font-hand mt-3 text-lg text-[var(--pencil)]">in den Guide übernommen</p>}
      </div>
      <div className="space-y-8">
        <div>
          <div className="flex flex-wrap gap-2">
            <Pill tone="dark">{EBENEN_LABEL[u.ebene]}</Pill>
            <Pill>{u.status}</Pill>
            {a?.schlagworte.map((s) => <Pill key={s} tone="outline">{s}</Pill>)}
          </div>
          <h1 className="mt-4 text-2xl font-bold leading-snug tracking-[-0.02em]">{a?.kurzbeschreibung || u.id}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {u.absender} · {formatDatum(u.datum)} · {u.id}
          </p>
          {u.briefing && (
            <Link href={`/briefings/${encodeURIComponent(u.briefing.split("/").pop()!.replace(/\.md$/, ""))}`} className="mt-3 inline-block text-sm underline decoration-[var(--pencil)] underline-offset-4">
              Zum Briefing
            </Link>
          )}
        </div>
        {(u.begruendung || u.transkript.length > 0) && (
          <div className="space-y-3">
            {u.begruendung && <MarginNote who={u.absender}>{u.begruendung}</MarginNote>}
            {u.transkript.map((t, i) => (
              <MarginNote key={i} who={u.absender} prefix={u.begruendung || i > 0 ? null : "why:"}>{t}</MarginNote>
            ))}
            {u.korrekturen.map((k, i) => (
              <MarginNote key={`k${i}`} who={k.absender} prefix="nb:">{k.text}</MarginNote>
            ))}
          </div>
        )}
        {a && (
          <div className="space-y-6">
            <List title="Gefällt" items={a.gefaellt} />
            <List title="Gefällt nicht" items={a.gefaellt_nicht} />
            {stil.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold">Stilmerkmale</h3>
                <dl className="mt-2 space-y-1 text-sm">
                  {stil.map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[9rem_1fr] gap-2">
                      <dt className="text-[var(--muted)]">{stilLabel[k] ?? k}</dt>
                      <dd>{v.join(", ")}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            {a.bezug_zur_marke && (
              <div>
                <h3 className="text-sm font-semibold">Bezug zur Marke</h3>
                <p className="mt-2 text-sm">{a.bezug_zur_marke}</p>
              </div>
            )}
          </div>
        )}
        {u.fehler && <p className="text-sm text-[var(--pencil)]">{u.fehler}</p>}
      </div>
    </article>
  );
}
