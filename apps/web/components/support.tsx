import { asArray } from "@tasteloop/core/read";
import { penFor } from "./margin-note";
import { PencilCircle } from "./pencil-circle";
import { Pill } from "./pill";

/**
 * Stütze eines Vorschlags: je Person ein Kreis in ihrer Stiftfarbe um ihr Initial,
 * dazu „3 Personen, 5 Belege“. Einzelstimme und Uneinigkeit als Etikett.
 */
export function SupportMarks({ props, size = "sm" }: { props: Record<string, unknown>; size?: "sm" | "lg" }) {
  const namen = asArray(props.stuetze_namen as string[] | string | undefined).map(String);
  const personen = Number(props.stuetze_personen ?? namen.length);
  const belege = Number(props.stuetze_belege ?? 0);
  const uneinig = Number(props.uneinig ?? 0);
  if (!namen.length && !belege) return null;
  const dim = size === "lg" ? "h-9 w-9 text-[1.35rem]" : "h-7 w-7 text-[1.05rem]";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex items-center gap-1.5" aria-label={`Gestützt von ${namen.join(", ")}`}>
        {namen.map((n) => (
          <span key={n} title={n} className={`font-hand relative inline-flex items-center justify-center ${dim}`} style={{ color: penFor(n) }}>
            {n.slice(0, 1).toUpperCase()}
            <PencilCircle seed={`person-${n}`} color={penFor(n)} width={1.4} draw={false} style={{ inset: 0, width: "100%", height: "100%" }} />
          </span>
        ))}
      </div>
      <span className="text-xs text-[var(--muted)]">
        {personen} {personen === 1 ? "Person" : "Personen"}, {belege} {belege === 1 ? "Beleg" : "Belege"}
      </span>
      {props.einzelstimme === true && <Pill tone="outline">Einzelstimme</Pill>}
      {uneinig > 0 && <Pill tone={props.uneinig_geklaert === true ? "neutral" : "pencil"}>{props.uneinig_geklaert === true ? "Uneinig, geklärt" : `Uneinig (${uneinig})`}</Pill>}
    </div>
  );
}
