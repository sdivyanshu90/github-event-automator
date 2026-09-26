import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { overviewForUser } from "@/db/queries";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const overview = await overviewForUser(user.id);
  const stats = [
    ["Connected repositories", overview.connectedRepositories], ["Active rules", overview.activeRules], ["Received events", overview.receivedEvents],
    ["Successful actions", overview.successfulActions], ["Failed actions", overview.failedActions],
  ];
  return <>
    <div className="page-heading"><div><h1>Operational overview</h1><p className="muted">Current persisted state across your automations.</p></div><Link className="button" href="/dashboard/rules/new">Create rule</Link></div>
    <section className="stats">{stats.map(([label, value]) => <div className="stat" key={String(label)}><div className="muted">{label}</div><div className="stat-value">{value}</div></div>)}</section>
    <section style={{ marginTop: "1.5rem" }}><h2>Recent activity</h2>{overview.recent.length ? <div className="table-wrap"><table><thead><tr><th>Time</th><th>Repository</th><th>Activity</th><th>Status</th></tr></thead><tbody>{overview.recent.map((item) => <tr key={item.id}><td>{item.createdAt.toLocaleString()}</td><td>{item.repository ?? "—"}</td><td>{item.message}</td><td><StatusBadge status={item.status} /></td></tr>)}</tbody></table></div> : <div className="panel empty">No webhook activity yet. Connect a repository and create a rule.</div>}</section>
  </>;
}
