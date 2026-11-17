import { briefings } from "@tasteloop/core/read";
import { FocusCards } from "@/components/ui/focus-cards";
import { imageUrl, reader } from "@/lib/vault";

export default function BriefingsPage() {
  const list = briefings(reader());
  return (
    <div>
      <h1 className="text-4xl font-bold tracking-[-0.035em]">Briefings</h1>
      <p className="mb-10 mt-2 text-sm text-[var(--muted)]">Stil der Referenz, Identität der Marke. {list.length} Briefings.</p>
      {list.length ? (
        <FocusCards
          cards={list.map((b) => ({
            key: b.path,
            title: String(b.props.titel ?? b.name),
            subtitle: `${String(b.props.status ?? "")} · ${String(b.props.erstellt ?? "")}`,
            src: b.bild ? imageUrl(b.bild) : "",
            href: `/briefings/${encodeURIComponent(b.name)}`,
          }))}
        />
      ) : (
        <p className="font-hand text-xl text-[var(--muted)]">Noch keine Briefings. Ein Upload mit Ebene „Kampagne“ erzeugt eins.</p>
      )}
    </div>
  );
}
