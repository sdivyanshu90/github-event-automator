import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthenticationError } from "@/lib/errors";

export async function currentUser() {
  const session = await auth();
  return session?.user?.id ? session.user : null;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/signin");
  return user;
}

export async function requireApiUser() {
  const user = await currentUser();
  if (!user) throw new AuthenticationError();
  return user;
}
