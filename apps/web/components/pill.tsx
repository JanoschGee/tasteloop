import Link from "next/link";
import { cn } from "@/lib/utils";
import { PencilCircle } from "./pencil-circle";

/** Small label: ink on paper, no colour. */
export function Pill({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: "neutral" | "dark" | "outline" | "pencil"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-[0.7rem] uppercase tracking-[0.08em]",
        tone === "neutral" && "bg-[rgba(17,17,17,0.06)] text-[var(--ink)]",
        tone === "dark" && "bg-[var(--ink)] text-[var(--paper)]",
        tone === "outline" && "border border-[var(--ink)] text-[var(--ink)]",
        tone === "pencil" && "border border-[var(--pencil)] text-[var(--pencil)]",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Filter: the active filter is circled in red pencil. */
export function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn("relative px-2.5 py-1 text-sm transition-colors", active ? "text-[var(--ink)]" : "text-[var(--muted)] hover:text-[var(--ink)]")}>
      {children}
      {active && <PencilCircle seed={`filter-${href}`} width={1.6} style={{ left: "-4%", top: "-10%", width: "108%", height: "120%" }} />}
    </Link>
  );
}
