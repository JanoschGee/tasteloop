import Link from "next/link";

export default function NotFound() {
  return (
    <div>
      <h1 className="text-xl font-bold">Nicht gefunden</h1>
      <Link href="/" className="mt-3 inline-block text-sm underline">Zur Galerie</Link>
    </div>
  );
}
