import { PencilCircle } from "./pencil-circle";
import { cn } from "@/lib/utils";

/** Wordmark "tasteloop" with a hand-drawn red pencil circle around "loop". */
export function Logo({ className, draw = false }: { className?: string; draw?: boolean }) {
  return (
    <span className={cn("inline-flex items-baseline font-bold tracking-[-0.045em] text-[var(--ink)]", className)}>
      taste
      <span className="relative">
        loop
        <PencilCircle
          seed="tasteloop-logo"
          draw={draw}
          width={1.8}
          style={{ left: "-0.3em", top: "-0.3em", width: "calc(100% + 0.6em)", height: "calc(100% + 0.6em)" }}
        />
      </span>
    </span>
  );
}
