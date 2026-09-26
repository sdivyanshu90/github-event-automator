import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { database } from "@/db";
import { users } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import { synchronizeInstallation } from "@/services/installations";
import { validInstallationState } from "@/services/install-state";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const installationId = url.searchParams.get("installation_id");
  const returnedState = url.searchParams.get("state") ?? "";
  const expectedState = request.headers.get("cookie")?.match(/(?:^|;\s*)github_install_state=([^;]+)/)?.[1] ?? "";
  const user = await currentUser();
  if (!user) {
    const callbackUrl = `/api/github/setup?installation_id=${encodeURIComponent(installationId ?? "")}&state=${encodeURIComponent(returnedState)}`;
    return NextResponse.redirect(new URL(`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`, url.origin));
  }
  if (!installationId) return NextResponse.redirect(new URL("/dashboard/repositories?error=missing-installation", url.origin));
  if (!validInstallationState(expectedState, returnedState)) return NextResponse.redirect(new URL("/dashboard/repositories?error=invalid-state", url.origin));
  try {
    const [record] = await database().select({ token: users.githubTokenEncrypted }).from(users).where(eq(users.id, user.id)).limit(1);
    if (!record?.token) throw new AppError("GitHub user token unavailable", "AUTHENTICATION", false, 401, "Sign in with GitHub again before installing the app");
    await synchronizeInstallation(user.id, installationId, decryptSecret(record.token));
    const response = NextResponse.redirect(new URL("/dashboard/repositories?connected=1", url.origin));
    response.cookies.delete("github_install_state");
    return response;
  } catch (error) {
    const reason = error instanceof AppError ? error.code.toLowerCase() : "sync-failed";
    const response = NextResponse.redirect(new URL(`/dashboard/repositories?error=${encodeURIComponent(reason)}`, url.origin));
    response.cookies.delete("github_install_state");
    return response;
  }
}
