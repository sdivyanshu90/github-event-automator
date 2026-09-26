import { toggleRepository } from "@/app/actions";
import { StatusBadge } from "@/components/status-badge";
import { repositoriesForUser } from "@/db/queries";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function RepositoriesPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const user = await requireUser();
  const [items, params] = await Promise.all([repositoriesForUser(user.id), searchParams]);
  const slug = process.env.GITHUB_APP_SLUG;
  return <>
    <div className="page-heading"><div><h1>Repositories</h1><p className="muted">Repositories currently exposed to your GitHub App installation.</p></div>{slug ? <a className="button" href="/api/github/install">Install or configure GitHub App</a> : <span className="notice">Set GITHUB_APP_SLUG to enable installation links.</span>}</div>
    {params.connected ? <p className="notice">Installation synchronized successfully.</p> : null}
    {params.error ? <p className="notice error">Installation synchronization failed ({params.error}). Check configuration and permissions.</p> : null}
    {items.length ? <div className="table-wrap"><table><thead><tr><th>Repository</th><th>GitHub ID</th><th>Status</th><th>Control</th></tr></thead><tbody>{items.map((repository) => <tr key={repository.id}><td><strong>{repository.fullName}</strong></td><td className="code">{repository.githubId}</td><td><StatusBadge status={repository.active ? "active" : "disabled"} /></td><td><form action={toggleRepository}><input type="hidden" name="repositoryId" value={repository.id} /><input type="hidden" name="active" value={String(!repository.active)} /><button className="button button-secondary button-small" type="submit">{repository.active ? "Disable" : "Enable"}</button></form></td></tr>)}</tbody></table></div> : <div className="panel empty">No repositories connected. Install the GitHub App, select repositories, and return through its setup URL.</div>}
  </>;
}
