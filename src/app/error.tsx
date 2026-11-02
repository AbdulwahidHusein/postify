"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-5 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-mist">Please try again. If it keeps happening, contact support.</p>
      <button onClick={reset} className="mt-6 rounded-lg bg-signal px-4 py-2 text-sm font-medium text-accent-fg">Try again</button>
    </main>
  );
}
