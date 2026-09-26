"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { database } from "@/db";
import { repositories, rules } from "@/db/schema";
import { requireApiUser } from "@/lib/auth";
import { actionsFromForm, ruleInputSchema } from "@/services/rules";
import { retryFailedJob } from "@/services/worker";

function safeInternalPath(value: FormDataEntryValue | null, fallback: string): string {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") ? path : fallback;
}

export async function githubSignIn(formData: FormData) {
  await signIn("github", { redirectTo: safeInternalPath(formData.get("callbackUrl"), "/dashboard") });
}

export async function githubSignOut() {
  await signOut({ redirectTo: "/" });
}

function parseRule(formData: FormData) {
  return ruleInputSchema.safeParse({
    repositoryId: String(formData.get("repositoryId") ?? ""),
    name: String(formData.get("name") ?? ""),
    eventType: String(formData.get("eventType") ?? ""),
    titleContains: String(formData.get("titleContains") ?? "").trim() || null,
    authorEquals: String(formData.get("authorEquals") ?? "").trim() || null,
    labelContains: String(formData.get("labelContains") ?? "").trim() || null,
    actions: actionsFromForm(formData),
    enabled: formData.get("enabled") === "on",
  });
}

export async function createRule(formData: FormData) {
  const user = await requireApiUser();
  const parsed = parseRule(formData);
  if (!parsed.success) redirect(`/dashboard/rules/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid rule")}`);
  const [ownedRepository] = await database()
    .select({ id: repositories.id })
    .from(repositories)
    .where(and(eq(repositories.id, parsed.data.repositoryId), eq(repositories.userId, user.id), eq(repositories.active, true)))
    .limit(1);
  if (!ownedRepository) redirect("/dashboard/rules/new?error=Repository%20not%20found");
  await database().insert(rules).values({ userId: user.id, ...parsed.data });
  revalidatePath("/dashboard");
  redirect("/dashboard/rules?created=1");
}

export async function updateRule(ruleId: string, formData: FormData) {
  const user = await requireApiUser();
  const parsed = parseRule(formData);
  if (!parsed.success) redirect(`/dashboard/rules/${ruleId}/edit?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid rule")}`);
  const [ownedRepository] = await database()
    .select({ id: repositories.id })
    .from(repositories)
    .where(and(eq(repositories.id, parsed.data.repositoryId), eq(repositories.userId, user.id), eq(repositories.active, true)))
    .limit(1);
  if (!ownedRepository) redirect(`/dashboard/rules/${ruleId}/edit?error=Repository%20not%20found`);
  const changed = await database()
    .update(rules)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(rules.id, ruleId), eq(rules.userId, user.id), isNull(rules.deletedAt)))
    .returning({ id: rules.id });
  if (changed.length !== 1) redirect("/dashboard/rules?error=Rule%20not%20found");
  revalidatePath("/dashboard");
  redirect("/dashboard/rules?updated=1");
}

export async function deleteRule(formData: FormData) {
  const user = await requireApiUser();
  const ruleId = String(formData.get("ruleId") ?? "");
  await database().update(rules).set({ enabled: false, deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(rules.id, ruleId), eq(rules.userId, user.id), isNull(rules.deletedAt)));
  revalidatePath("/dashboard");
}

export async function toggleRule(formData: FormData) {
  const user = await requireApiUser();
  const ruleId = String(formData.get("ruleId") ?? "");
  const enabled = formData.get("enabled") === "true";
  await database().update(rules).set({ enabled, updatedAt: new Date() }).where(and(eq(rules.id, ruleId), eq(rules.userId, user.id), isNull(rules.deletedAt)));
  revalidatePath("/dashboard");
}

export async function toggleRepository(formData: FormData) {
  const user = await requireApiUser();
  const repositoryId = String(formData.get("repositoryId") ?? "");
  const active = formData.get("active") === "true";
  await database().update(repositories).set({ active, updatedAt: new Date() }).where(and(eq(repositories.id, repositoryId), eq(repositories.userId, user.id)));
  revalidatePath("/dashboard");
}

export async function retryJob(formData: FormData) {
  const user = await requireApiUser();
  await retryFailedJob(user.id, String(formData.get("jobId") ?? ""));
  revalidatePath("/dashboard/failures");
}
