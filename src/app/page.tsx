import Link from "next/link";
import { currentUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await currentUser();
  return (
    <main>
      <div className="container">
        <section className="hero">
          <div className="eyebrow">Event-driven repository operations</div>
          <h1>GitHub automation that survives the unhappy path.</h1>
          <p className="lead">Hookwise verifies, stores, evaluates, and executes repository automation with durable jobs, bounded retries, and a complete operational trail.</p>
          <div className="actions">
            <Link className="button" href={user ? "/dashboard" : "/signin"}>{user ? "Open dashboard" : "Sign in with GitHub"}</Link>
            <a className="button button-secondary" href="https://github.com/sdivyanshu90/github-event-automator">View source</a>
          </div>
        </section>
        <section className="feature-grid" aria-label="Core capabilities">
          <article className="panel"><h3>Verified ingestion</h3><p className="muted">Exact raw-body HMAC verification and database-backed replay protection.</p></article>
          <article className="panel"><h3>Durable actions</h3><p className="muted">Independent GitHub, Slack, and AI jobs with explicit retry state.</p></article>
          <article className="panel"><h3>Operational clarity</h3><p className="muted">Every delivery, rule match, action, failure, and retry remains visible.</p></article>
        </section>
      </div>
      <footer className="footer"><div className="container">Built for unattended operation on free-tier infrastructure.</div></footer>
    </main>
  );
}
