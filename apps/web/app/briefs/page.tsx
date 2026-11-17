import { briefs } from "@tasteloop/core/read";
import { FocusCards } from "@/components/ui/focus-cards";
import { imageUrl, reader } from "@/lib/vault";

export default function BriefsPage() {
  const list = briefs(reader());
  return (
    <div>
      <h1 className="text-4xl font-bold tracking-[-0.035em]">Briefs</h1>
      <p className="mb-10 mt-2 text-sm text-[var(--muted)]">The style of the reference, the identity of the brand. {list.length} {list.length === 1 ? "brief" : "briefs"}.</p>
      {list.length ? (
        <FocusCards
          cards={list.map((b) => ({
            key: b.path,
            title: String(b.props.title ?? b.name),
            subtitle: `${String(b.props.status ?? "")} · ${String(b.props.created ?? "")}`,
            src: b.image ? imageUrl(b.image) : "",
            href: `/briefs/${encodeURIComponent(b.name)}`,
          }))}
        />
      ) : (
        <p className="font-hand text-xl text-[var(--muted)]">No briefs yet. An upload with the level "Campaign" creates one.</p>
      )}
    </div>
  );
}
