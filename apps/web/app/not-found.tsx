import Link from "next/link";

export default function NotFound() {
  return (
    <div>
      <h1 className="text-xl font-bold">Not found</h1>
      <Link href="/" className="mt-3 inline-block text-sm underline">Back to the gallery</Link>
    </div>
  );
}
