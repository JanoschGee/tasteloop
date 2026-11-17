"use client";

/**
 * Aceternity UI „Focus Cards“ (ui.aceternity.com, freie Komponente), als Grundgerüst übernommen
 * und auf Stil D „Markup“ umgebaut: kein Blur, kein Verlauf, kein dunkles Overlay.
 * Fokus heißt hier nur: die anderen Karten treten leise zurück.
 * Karten wie Fotos auf Papier, Bildunterschrift darunter, Begründung als Randnotiz.
 * Markierte Karten (z. B. in den Guide übernommen) bekommen einen Rotstift-Kreis.
 */
import React, { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { PencilCircle } from "@/components/pencil-circle";
import { MarginNote } from "@/components/margin-note";

export type FocusCard = {
  key: string;
  title: string;
  subtitle?: string;
  src: string;
  href: string;
  note?: { who: string; text: string };
  marked?: boolean;
  markLabel?: string;
};

export const Card = React.memo(
  ({
    card,
    index,
    hovered,
    setHovered,
  }: {
    card: FocusCard;
    index: number;
    hovered: number | null;
    setHovered: React.Dispatch<React.SetStateAction<number | null>>;
  }) => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: hovered !== null && hovered !== index ? 0.55 : 1 }}
      transition={{ duration: 0.25 }}
      className="relative"
    >
      <Link
        href={card.href}
        onMouseEnter={() => setHovered(index)}
        onMouseLeave={() => setHovered(null)}
        onFocus={() => setHovered(index)}
        onBlur={() => setHovered(null)}
        className="group block focus:outline-none"
      >
        <div className="relative border border-[var(--line)] bg-[var(--card)] p-2">
          <div className="relative aspect-[4/5] overflow-hidden bg-[#eeebe4]">
            {card.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={card.src} alt={card.title} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
            ) : null}
          </div>
          {card.marked && (
            <PencilCircle seed={card.key} delay={0.2 + Math.min(index, 8) * 0.05} style={{ left: "-6%", top: "-4%", width: "112%", height: "108%" }} />
          )}
        </div>
        <div className="mt-3 px-0.5">
          <div className="text-[0.95rem] font-bold leading-snug tracking-[-0.01em] group-hover:underline group-hover:decoration-[var(--pencil)] group-hover:underline-offset-4">
            {card.title}
          </div>
          {card.subtitle && <div className="mt-0.5 text-xs text-[var(--muted)]">{card.subtitle}</div>}
          {card.marked && card.markLabel && <div className="font-hand mt-1 text-[1.2rem] text-[var(--pencil)]">{card.markLabel}</div>}
        </div>
      </Link>
      {card.note && <MarginNote who={card.note.who} className="mt-2 px-0.5">{card.note.text}</MarginNote>}
    </motion.div>
  ),
);

Card.displayName = "Card";

export function FocusCards({ cards }: { cards: FocusCard[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div className="grid w-full grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card, index) => (
        <Card key={card.key} card={card} index={index} hovered={hovered} setHovered={setHovered} />
      ))}
    </div>
  );
}
