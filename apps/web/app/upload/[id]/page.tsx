import Link from "next/link";
import { notFound } from "next/navigation";
import { acceptedUploadIds, LEVEL_LABEL, STYLE_LABEL, upload } from "@tasteloop/core/read";
import { MarginNote } from "@/components/margin-note";
import { PencilCircle } from "@/components/pencil-circle";
import { Pill } from "@/components/pill";
import { formatDate, imageUrl, reader } from "@/lib/vault";

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="text-sm font-bold">{title}</h3>
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
  const inGuide = acceptedUploadIds(r).has(u.id);
  const a = u.analysis;
  const style = a ? (Object.entries(a.style) as [keyof typeof STYLE_LABEL, string[]][]).filter(([, v]) => v.length) : [];

  return (
    <article className="grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div>
        <div className="relative border border-[var(--line)] bg-[var(--card)] p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl(u.image)} alt={a?.summary ?? u.id} className="w-full bg-[#eeebe4]" />
          {inGuide && <PencilCircle seed={u.id} style={{ left: "-5%", top: "-4%", width: "110%", height: "108%" }} />}
        </div>
        {inGuide && <p className="font-hand mt-3 text-lg text-[var(--pencil)]">applied to the guide</p>}
      </div>
      <div className="space-y-8">
        <div>
          <div className="flex flex-wrap gap-2">
            <Pill tone="dark">{LEVEL_LABEL[u.level]}</Pill>
            <Pill>{u.status}</Pill>
            {a?.keywords.map((s) => <Pill key={s} tone="outline">{s}</Pill>)}
          </div>
          <h1 className="mt-4 text-2xl font-bold leading-snug tracking-[-0.02em]">{a?.summary || u.id}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {u.sender} · {formatDate(u.date)} · {u.id}
          </p>
          {u.brief && (
            <Link href={`/briefs/${encodeURIComponent(u.brief.split("/").pop()!.replace(/\.md$/, ""))}`} className="mt-3 inline-block text-sm underline decoration-[var(--pencil)] underline-offset-4">
              Open the brief
            </Link>
          )}
        </div>
        {(u.why || u.transcript.length > 0 || u.corrections.length > 0) && (
          <div className="space-y-3">
            {u.why && <MarginNote who={u.sender}>{u.why}</MarginNote>}
            {u.transcript.map((t, i) => (
              <MarginNote key={i} who={u.sender} prefix={u.why || i > 0 ? null : "why:"}>{t}</MarginNote>
            ))}
            {u.corrections.map((k, i) => (
              <MarginNote key={`k${i}`} who={k.sender} prefix="nb:">{k.text}</MarginNote>
            ))}
          </div>
        )}
        {a && (
          <div className="space-y-6">
            <List title="Likes" items={a.likes} />
            <List title="Dislikes" items={a.dislikes} />
            {style.length > 0 && (
              <div>
                <h3 className="text-sm font-bold">Style</h3>
                <dl className="mt-2 space-y-1 text-sm">
                  {style.map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[9rem_1fr] gap-2">
                      <dt className="text-[var(--muted)]">{STYLE_LABEL[k] ?? k}</dt>
                      <dd>{v.join(", ")}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            {a.brand_fit && (
              <div>
                <h3 className="text-sm font-bold">Brand fit</h3>
                <p className="mt-2 text-sm">{a.brand_fit}</p>
              </div>
            )}
          </div>
        )}
        {u.error && <p className="text-sm text-[var(--pencil)]">{u.error}</p>}
      </div>
    </article>
  );
}
