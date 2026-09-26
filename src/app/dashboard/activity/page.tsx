import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { activityForUser, recentDeliveriesForUser } from "@/db/queries";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const [activity, deliveries] = await Promise.all([activityForUser(user.id, params.status), recentDeliveriesForUser(user.id)]);
  return <div className="stack">
    <div className="page-heading"><div><h1>Activity</h1><p className="muted">Polling this page shows persisted delivery and execution state.</p></div><div className="actions" style={{ marginTop: 0 }}>{["all", "success", "warning", "error"].map((status) => <Link className="button button-secondary button-small" key={status} href={status === "all" ? "/dashboard/activity" : `/dashboard/activity?status=${status}`}>{status}</Link>)}</div></div>
    <section><h2>Deliveries</h2>{deliveries.length ? <div className="table-wrap"><table><thead><tr><th>Received</th><th>Repository</th><th>Event</th><th>Delivery</th><th>Jobs</th><th>Status</th></tr></thead><tbody>{deliveries.map((delivery) => <tr key={delivery.id}><td>{delivery.receivedAt.toLocaleString()}</td><td>{delivery.repository ?? "—"}</td><td>{delivery.eventType}.{delivery.action}</td><td className="code">{delivery.deliveryId}<br/><span className="muted">duplicates: {delivery.duplicateCount}</span></td><td>{delivery.jobCount}</td><td><StatusBadge status={delivery.status}/></td></tr>)}</tbody></table></div> : <div className="panel empty">No deliveries received.</div>}</section>
    <section><h2>Execution log</h2>{activity.length ? <div className="table-wrap"><table><thead><tr><th>Time</th><th>Repository / event</th><th>Rule / action</th><th>Outcome</th><th>Attempts</th></tr></thead><tbody>{activity.map((item) => <tr key={item.id}><td>{item.createdAt.toLocaleString()}</td><td>{item.repository ?? "—"}<div className="muted">{item.eventType ? `${item.eventType}.${item.eventAction}` : ""}</div></td><td>{item.ruleName ?? "—"}<div className="muted">{item.actionType?.replaceAll("_", " ")}</div></td><td><StatusBadge status={item.status}/><div>{item.message}</div>{item.error ? <div className="muted">{item.error}</div> : null}{item.actionType === "ai_triage" && item.result ? <div className="muted code">{JSON.stringify(item.result)}</div> : null}</td><td>{item.attempts ?? "—"}</td></tr>)}</tbody></table></div> : <div className="panel empty">No matching activity.</div>}</section>
  </div>;
}
