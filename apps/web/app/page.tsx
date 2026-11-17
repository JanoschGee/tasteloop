import { acceptedUploadIds, LEVELS, LEVEL_LABEL, uploads, type LevelOrOpen } from "@tasteloop/core/read";
import { FocusCards } from "@/components/ui/focus-cards";
import { FilterLink } from "@/components/pill";
import { formatDate, imageUrl, reader } from "@/lib/vault";

const STATUS = ["new", "analyzed", "in_digest", "error"] as const;
const STATUS_LABEL: Record<string, string> = { new: "new", analyzed: "analysed", in_digest: "in a digest", error: "error" };

function href(level?: string, status?: string) {
  const p = new URLSearchParams();
  if (level) p.set("level", level);
  if (status) p.set("status", status);
  const q = p.toString();
  return q ? `/?${q}` : "/";
}

export default async function Gallery({ searchParams }: { searchParams: Promise<{ level?: string; status?: string }> }) {
  const { level, status } = await searchParams;
  const r = reader();
  const all = uploads(r);
  const accepted = acceptedUploadIds(r);
  const list = all.filter((u) => (!level || u.level === level) && (!status || u.status === status));
  const levels: LevelOrOpen[] = [...LEVELS, "open"];

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-bold tracking-[-0.035em]">Gallery</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {list.length} of {all.length} uploads · circled in red: applied to the guide
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex flex-wrap gap-1">
            <FilterLink href={href(undefined, status)} active={!level}>All levels</FilterLink>
            {levels.map((e) => (
              <FilterLink key={e} href={href(e, status)} active={level === e}>
                {LEVEL_LABEL[e]}
              </FilterLink>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            <FilterLink href={href(level, undefined)} active={!status}>Any status</FilterLink>
            {STATUS.map((s) => (
              <FilterLink key={s} href={href(level, s)} active={status === s}>
                {STATUS_LABEL[s]}
              </FilterLink>
            ))}
          </div>
        </div>
      </div>
      {list.length ? (
        <FocusCards
          cards={list.map((u) => {
            const why = u.why.trim() || u.transcript[0]?.trim() || "";
            return {
              key: u.id,
              title: u.analysis?.summary?.slice(0, 90) || u.id,
              subtitle: `${LEVEL_LABEL[u.level]} · ${formatDate(u.date)}`,
              src: imageUrl(u.image),
              href: `/upload/${u.id}`,
              note: why ? { who: u.sender, text: why.length > 140 ? `${why.slice(0, 137)}…` : why } : undefined,
              marked: accepted.has(u.id),
              markLabel: "in the guide",
            };
          })}
        />
      ) : (
        <p className="font-hand text-xl text-[var(--muted)]">Nothing here yet. Post an image in your Telegram group and say why.</p>
      )}
    </div>
  );
}
