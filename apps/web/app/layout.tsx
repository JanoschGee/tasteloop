import type { Metadata } from "next";
// Handwriting for margin notes: Caveat (SIL Open Font License), self-hosted through the build, no Google CDN
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

function brandName(): string {
  try {
    return reader().cfg.brand.name;
  } catch {
    return "Brand";
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--paper)]">
        <Nav brand={brandName()} />
        <main className="mx-auto max-w-6xl px-6 py-12">{children}</main>
        <footer className="mx-auto max-w-6xl px-6 pb-10 pt-6 text-xs text-[var(--muted)]">
          <span className="font-hand text-[1.2rem] text-[var(--pencil)]">circle it. say why.</span>
        </footer>
      </body>
    </html>
  );
}
