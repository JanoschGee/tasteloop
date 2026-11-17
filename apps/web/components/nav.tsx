import Link from "next/link";
import { Logo } from "./logo";

const LINKS = [
  { href: "/", label: "Galerie" },
  { href: "/guide", label: "Guide" },
  { href: "/vorschlaege", label: "Vorschläge" },
  { href: "/briefings", label: "Briefings" },
];

/** Kopf: Wortmarke, darunter klein der Name der Marke, deren Geschmack hier gesammelt wird. */
export function Nav({ marke }: { marke: string }) {
  return (
    <header className="border-b border-[var(--ink)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-6 px-6 pb-4 pt-7">
        <Link href="/" className="flex items-baseline gap-4" aria-label="Tasteloop, zur Galerie">
          <Logo className="text-[1.65rem]" />
          <span className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">{marke}</span>
        </Link>
        <nav className="flex flex-wrap gap-6 text-sm">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:underline hover:decoration-[var(--pencil)] hover:underline-offset-4">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
