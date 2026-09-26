"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="container"><section className="panel signin"><h2>Something went wrong</h2><p className="muted">The operation could not be completed. No internal details were exposed.</p><button className="button" onClick={reset}>Try again</button></section></main>;
}
