import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-5 text-center">
      <p className="text-sm font-semibold text-accent-ink">404</p>
      <h1 className="mt-2 text-2xl font-semibold">This page isn&apos;t here</h1>
      <p className="mt-2 text-mist">The shop or product may have moved, sold, or been removed.</p>
      <Link href="/" className="mt-6 text-sm font-medium text-accent-ink">Go to Goods</Link>
    </main>
  );
}
