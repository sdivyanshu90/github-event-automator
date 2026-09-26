import { createRule } from "@/app/actions";
import { RuleForm } from "@/components/rule-form";
import { repositoriesForUser } from "@/db/queries";
import { requireUser } from "@/lib/auth";

export default async function NewRulePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const [repositories, params] = await Promise.all([repositoriesForUser(user.id), searchParams]);
  return <><div className="page-heading"><div><h1>Create rule</h1><p className="muted">All conditions are ANDed. Choose at least one action.</p></div></div>{params.error ? <p className="notice error">{params.error}</p> : null}<RuleForm repositories={repositories} action={createRule} /></>;
}
