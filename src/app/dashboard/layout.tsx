import Link from "next/link";
import { githubSignOut } from "@/app/actions";
import { requireUser } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <main className="container dashboard">
      <div className="page-heading">
        <div><div className="eyebrow">Signed in as {user.login}</div></div>
        <div className="actions" style={{ marginTop: 0 }}>
          <nav className="nav" aria-label="Dashboard">
            <Link href="/dashboard">Overview</Link><Link href="/dashboard/activity">Activity</Link><Link href="/dashboard/repositories">Repositories</Link><Link href="/dashboard/rules">Rules</Link><Link href="/dashboard/failures">Failures</Link>
          </nav>
          <form action={githubSignOut}><button className="button button-secondary button-small" type="submit">Sign out</button></form>
        </div>
      </div>
      {children}
    </main>
  );
}
