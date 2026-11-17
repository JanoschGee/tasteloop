import type { Metadata } from "next";
// Handschrift für Randnotizen: Caveat (SIL Open Font License), selbst gehostet über den Build, kein Google-CDN
import "@fontsource/caveat/latin-400.css";
import "@fontsource/caveat/latin-600.css";
import "./globals.css";
import { Nav } from "@/components/nav";
import { reader } from "@/lib/vault";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Tasteloop", template: "%s · Tasteloop" },
  description: "Taste can't be prompted.",
  robots: { index: false, follow: false },
};

function markenName(): string {
  try {
    return reader().cfg.marke.name;
  } catch {
    return "Brand";
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-[var(--paper)]">
        <Nav marke={markenName()} />
        <main className="mx-auto max-w-6xl px-6 py-12">{children}</main>
        <footer className="mx-auto max-w-6xl px-6 pb-10 pt-6 text-xs text-[var(--muted)]">
          <span className="font-hand text-[1.2rem] text-[var(--pencil)]">circle it. say why.</span>
        </footer>
      </body>
    </html>
  );
}
