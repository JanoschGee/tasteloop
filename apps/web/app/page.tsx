import { acceptedUploadIds, EBENEN, EBENEN_LABEL, uploads, type EbeneOderOffen } from "@tasteloop/core/read";
import { FocusCards } from "@/components/ui/focus-cards";
import { FilterLink } from "@/components/pill";
import { formatDatum, imageUrl, reader } from "@/lib/vault";

const STATUS = ["neu", "analysiert", "im-digest", "fehler"] as const;

function href(ebene?: string, status?: string) {
  const p = new URLSearchParams();
  if (ebene) p.set("ebene", ebene);
  if (status) p.set("status", status);
  const q = p.toString();
  return q ? `/?${q}` : "/";
}

export default async function Galerie({ searchParams }: { searchParams: Promise<{ ebene?: string; status?: string }> }) {
  const { ebene, status } = await searchParams;
  const r = reader();
  const all = uploads(r);
  const accepted = acceptedUploadIds(r);
  const list = all.filter((u) => (!ebene || u.ebene === ebene) && (!status || u.status === status));
  const ebenen: EbeneOderOffen[] = [...EBENEN, "offen"];

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-bold tracking-[-0.035em]">Galerie</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {list.length} von {all.length} Uploads · rot umkreist: in den Guide übernommen
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex flex-wrap gap-1">
            <FilterLink href={href(undefined, status)} active={!ebene}>Alle Ebenen</FilterLink>
            {ebenen.map((e) => (
              <FilterLink key={e} href={href(e, status)} active={ebene === e}>
                {EBENEN_LABEL[e]}
              </FilterLink>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            <FilterLink href={href(ebene, undefined)} active={!status}>Jeder Status</FilterLink>
            {STATUS.map((s) => (
              <FilterLink key={s} href={href(ebene, s)} active={status === s}>
                {s}
              </FilterLink>
            ))}
          </div>
        </div>
      </div>
      {list.length ? (
        <FocusCards
          cards={list.map((u) => {
            const why = u.begruendung.trim() || u.transkript[0]?.trim() || "";
            return {
              key: u.id,
              title: u.analyse?.kurzbeschreibung?.slice(0, 90) || u.id,
              subtitle: `${EBENEN_LABEL[u.ebene]} · ${formatDatum(u.datum)}`,
              src: imageUrl(u.bild),
              href: `/upload/${u.id}`,
              note: why ? { who: u.absender, text: why.length > 140 ? `${why.slice(0, 137)}…` : why } : undefined,
              marked: accepted.has(u.id),
              markLabel: "im Guide",
            };
          })}
        />
      ) : (
        <p className="font-hand text-xl text-[var(--muted)]">Noch nichts hier. Bild in die Telegram-Gruppe, Begründung dazu.</p>
      )}
    </div>
  );
}
