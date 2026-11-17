import { cn } from "@/lib/utils";

/**
 * Randnotiz in Handschrift: die Begründung („why: …“). Jede Person hat ihre eigene Stiftfarbe,
 * so werden mehrere Beitragende sichtbar. Rot bleibt dem Kreis vorbehalten.
 */
const PENS = ["#23408E", "#1F6F3B", "#3A3A3A", "#5A2D82", "#7A4A12"];

export function penFor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PENS[h % PENS.length];
}

export function MarginNote({ who, children, className, prefix = "why:" }: { who: string; children: React.ReactNode; className?: string; prefix?: string | null }) {
  return (
    <p className={cn("font-hand text-[1.35rem] leading-[1.15] -rotate-[1.2deg]", className)} style={{ color: penFor(who) }}>
      {prefix && <span className="mr-1">{prefix}</span>}
      {children}
      <span className="ml-2 align-middle font-sans text-[0.68rem] not-italic tracking-wide text-[var(--muted)]">— {who}</span>
    </p>
  );
}
