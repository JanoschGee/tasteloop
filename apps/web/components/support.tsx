import { asArray } from "@tasteloop/core/read";
import { penFor } from "./margin-note";
import { PencilCircle } from "./pencil-circle";
import { Pill } from "./pill";

/**
 * Support of a proposal: one circle per person in their pen colour around their initial,
 * plus "3 people, 5 references". Single voice and disputes as labels.
 */
export function SupportMarks({ props, size = "sm" }: { props: Record<string, unknown>; size?: "sm" | "lg" }) {
  const names = asArray(props.supporters as string[] | string | undefined).map(String);
  const people = Number(props.support_people ?? names.length);
  const refs = Number(props.support_refs ?? 0);
  const disputed = Number(props.disputed ?? 0);
  if (!names.length && !refs) return null;
  const dim = size === "lg" ? "h-9 w-9 text-[1.35rem]" : "h-7 w-7 text-[1.05rem]";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex items-center gap-1.5" aria-label={`Supported by ${names.join(", ")}`}>
        {names.map((n) => (
          <span key={n} title={n} className={`font-hand relative inline-flex items-center justify-center ${dim}`} style={{ color: penFor(n) }}>
            {n.slice(0, 1).toUpperCase()}
            <PencilCircle seed={`person-${n}`} color={penFor(n)} width={1.4} draw={false} style={{ inset: 0, width: "100%", height: "100%" }} />
          </span>
        ))}
      </div>
      <span className="text-xs text-[var(--muted)]">
        {people} {people === 1 ? "person" : "people"}, {refs} {refs === 1 ? "reference" : "references"}
      </span>
      {props.single_voice === true && <Pill tone="outline">Single voice</Pill>}
      {disputed > 0 && <Pill tone={props.dispute_resolved === true ? "neutral" : "pencil"}>{props.dispute_resolved === true ? "Disputed, resolved" : `Disputed (${disputed})`}</Pill>}
    </div>
  );
}
