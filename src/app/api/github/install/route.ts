import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { optionalEnv } from "@/lib/env";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/signin?callbackUrl=%2Fapi%2Fgithub%2Finstall", requestUrl.origin));
  const slug = optionalEnv("GITHUB_APP_SLUG");
  if (!slug || !/^[a-zA-Z0-9-]+$/.test(slug)) return NextResponse.redirect(new URL("/dashboard/repositories?error=app-not-configured", requestUrl.origin));
  const state = randomBytes(32).toString("base64url");
  const destination = new URL(`https://github.com/apps/${slug}/installations/new`);
  destination.searchParams.set("state", state);
  const response = NextResponse.redirect(destination);
  response.cookies.set("github_install_state", state, {
    httpOnly: true,
    secure: requestUrl.protocol === "https:",
    sameSite: "lax",
    path: "/api/github/setup",
    maxAge: 10 * 60,
  });
  return response;
}
