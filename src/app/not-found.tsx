import Link from "next/link";

export default function NotFound() {
  return <main className="container"><section className="panel signin"><h2>Not found</h2><p className="muted">The requested resource does not exist or is not available to you.</p><Link className="button" href="/dashboard">Return to dashboard</Link></section></main>;
}
