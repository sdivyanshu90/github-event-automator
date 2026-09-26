import { retryJob } from "@/app/actions";
import { StatusBadge } from "@/components/status-badge";
import { failuresForUser } from "@/db/queries";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function FailuresPage() {
  const user = await requireUser();
  const items = await failuresForUser(user.id);
  return <><div className="page-heading"><div><h1>Failures & retries</h1><p className="muted">Retryable work remains durable; terminal failures can be safely requeued.</p></div></div>{items.length ? <div className="table-wrap"><table><thead><tr><th>Created</th><th>Repository</th><th>Rule / action</th><th>Status</th><th>Attempts</th><th>Error</th><th>Control</th></tr></thead><tbody>{items.map((job) => <tr key={job.id}><td>{job.createdAt.toLocaleString()}</td><td>{job.repository}</td><td>{job.ruleName}<div className="muted">{job.actionType.replaceAll("_", " ")}</div></td><td><StatusBadge status={job.status}/>{job.status === "retry_scheduled" ? <div className="muted">{job.nextRetryAt.toLocaleString()}</div> : null}</td><td>{job.attemptCount} / {job.maxAttempts}</td><td>{job.lastError ?? "—"}</td><td>{job.status === "failed" ? <form action={retryJob}><input type="hidden" name="jobId" value={job.id}/><button className="button button-secondary button-small" type="submit">Retry now</button></form> : "automatic"}</td></tr>)}</tbody></table></div> : <div className="panel empty">No failed or retrying jobs.</div>}</>;
}
