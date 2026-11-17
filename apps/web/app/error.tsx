"use client";

export default function Error({ error }: { error: Error }) {
  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-bold">Das ließ sich nicht laden</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">{error.message}</p>
    </div>
  );
}
