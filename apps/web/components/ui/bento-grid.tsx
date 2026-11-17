/**
 * Aceternity UI "Bento Grid" (ui.aceternity.com, free component), used as the base.
 * "Markup" style: flat cards on paper, hairlines instead of shadows, no hover effects except an underline.
 */
import { cn } from "@/lib/utils";

export const BentoGrid = ({ className, children }: { className?: string; children?: React.ReactNode }) => {
  return <div className={cn("mx-auto grid max-w-7xl grid-cols-1 gap-6 md:auto-rows-[minmax(22rem,auto)] md:grid-cols-3", className)}>{children}</div>;
};

export const BentoGridItem = ({
  className,
  title,
  description,
  header,
  icon,
  overlay,
}: {
  className?: string;
  title?: string | React.ReactNode;
  description?: string | React.ReactNode;
  header?: React.ReactNode;
  icon?: React.ReactNode;
  overlay?: React.ReactNode;
}) => {
  return (
    <div className={cn("group/bento relative row-span-1 flex flex-col justify-between space-y-4 border border-[var(--line)] bg-[var(--card)] p-4", className)}>
      {header}
      <div>
        {icon}
        <div className="mt-2 mb-1 font-bold leading-snug tracking-[-0.01em] group-hover/bento:underline group-hover/bento:decoration-[var(--pencil)] group-hover/bento:underline-offset-4">{title}</div>
        <div className="text-xs text-[var(--muted)]">{description}</div>
      </div>
      {overlay}
    </div>
  );
};
