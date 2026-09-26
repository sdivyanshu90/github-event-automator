import { notFound } from "next/navigation";
import { updateRule } from "@/app/actions";
import { RuleForm } from "@/components/rule-form";
import { repositoriesForUser, ruleForUser } from "@/db/queries";
import { requireUser } from "@/lib/auth";

export default async function EditRulePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [rule, repositories] = await Promise.all([ruleForUser(user.id, id), repositoriesForUser(user.id)]);
  if (!rule) notFound();
  return <><div className="page-heading"><div><h1>Edit rule</h1><p className="muted">Updates affect future deliveries only.</p></div></div>{query.error ? <p className="notice error">{query.error}</p> : null}<RuleForm repositories={repositories} rule={rule} action={updateRule.bind(null, rule.id)} /></>;
}
