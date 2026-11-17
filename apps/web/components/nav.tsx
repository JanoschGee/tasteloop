import Link from "next/link";
import { Logo } from "./logo";

const LINKS = [
  { href: "/", label: "Gallery" },
  { href: "/guide", label: "Guide" },
  { href: "/proposals", label: "Proposals" },
  { href: "/briefs", label: "Briefs" },
];

/** Header: wordmark, with the name of the brand whose taste is collected here. */
export function Nav({ brand }: { brand: string }) {
  return (
    <header className="border-b border-[var(--ink)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-6 px-6 pb-4 pt-7">
        <Link href="/" className="flex items-baseline gap-4" aria-label="Tasteloop, gallery">
          <Logo className="text-[1.65rem]" />
          <span className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">{brand}</span>
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
