"use client";

/**
 * Red pencil circle around an element. A real pencil stroke (lib/pencil.ts), two passes like a
 * coloured pencil, drawn in once. No gradients, no gloss.
 */
import { motion, useReducedMotion } from "motion/react";
import { pencilCircle, seedOf } from "@/lib/pencil";
import { cn } from "@/lib/utils";

export function PencilCircle({
  seed,
  className,
  color = "var(--pencil)",
  width = 2.2,
  draw = true,
  delay = 0,
  style,
}: {
  seed: string;
  className?: string;
  color?: string;
  width?: number;
  draw?: boolean;
  delay?: number;
  style?: React.CSSProperties;
}) {
  const reduce = useReducedMotion();
  const s = seedOf(seed);
  const main = pencilCircle(s, { width: 200, height: 100 });
  const second = pencilCircle(s + 7, { width: 200, height: 100, overshoot: 0.06, inset: 6 });
  const animate = draw && !reduce;
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 100"
      preserveAspectRatio="none"
      style={style}
      className={cn("pointer-events-none absolute overflow-visible", className)}
    >
      <motion.path
        d={main.d}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        initial={animate ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.7, ease: "easeInOut", delay }}
      />
      <motion.path
        d={second.d}
        fill="none"
        stroke={color}
        strokeOpacity={0.35}
        strokeWidth={width * 0.6}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        initial={animate ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.7, ease: "easeInOut", delay: delay + 0.15 }}
      />
    </svg>
  );
}
