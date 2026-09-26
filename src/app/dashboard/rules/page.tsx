import Link from "next/link";
import { deleteRule, toggleRule } from "@/app/actions";
import { StatusBadge } from "@/components/status-badge";
import { rulesForUser } from "@/db/queries";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function RulesPage({ searchParams }: { searchParams: Promise<{ created?: string; updated?: string; error?: string }> }) {
  const user = await requireUser();
  const [items, params] = await Promise.all([rulesForUser(user.id), searchParams]);
  return <>
    <div className="page-heading"><div><h1>Automation rules</h1><p className="muted">Deterministic conditions generate independently retryable actions.</p></div><Link className="button" href="/dashboard/rules/new">Create rule</Link></div>
    {params.created || params.updated ? <p className="notice">Rule saved.</p> : null}{params.error ? <p className="notice error">{params.error}</p> : null}
    {items.length ? <div className="table-wrap"><table><thead><tr><th>Name</th><th>Repository</th><th>When</th><th>Then</th><th>Status</th><th>Controls</th></tr></thead><tbody>{items.map((rule) => <tr key={rule.id}><td><strong>{rule.name}</strong></td><td>{rule.repository}</td><td><span className="code">{rule.eventType}</span>{rule.titleContains ? <div className="muted">title contains “{rule.titleContains}”</div> : null}{rule.authorEquals ? <div className="muted">author = {rule.authorEquals}</div> : null}{rule.labelContains ? <div className="muted">label = {rule.labelContains}</div> : null}</td><td>{rule.actions.map((action) => action.type.replaceAll("_", " ")).join(", ")}</td><td><StatusBadge status={rule.enabled ? "active" : "disabled"} /></td><td><div className="actions" style={{ marginTop: 0 }}><Link className="button button-secondary button-small" href={`/dashboard/rules/${rule.id}/edit`}>Edit</Link><form action={toggleRule}><input type="hidden" name="ruleId" value={rule.id}/><input type="hidden" name="enabled" value={String(!rule.enabled)}/><button className="button button-secondary button-small" type="submit">{rule.enabled ? "Disable" : "Enable"}</button></form><form action={deleteRule}><input type="hidden" name="ruleId" value={rule.id}/><button className="button button-danger button-small" type="submit">Delete</button></form></div></td></tr>)}</tbody></table></div> : <div className="panel empty">No rules yet. Create one after connecting a repository.</div>}
  </>;
}
