import { redirect } from "next/navigation";
import { githubSignIn } from "@/app/actions";
import { currentUser } from "@/lib/auth";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const user = await currentUser();
  if (user) redirect("/dashboard");
  const params = await searchParams;
  return (
    <main className="container">
      <section className="panel signin">
        <div className="eyebrow">Secure access</div>
        <h2>Sign in to Hookwise</h2>
        <p className="muted">GitHub OAuth identifies you. Repository automation uses separate, short-lived GitHub App installation tokens.</p>
        {params.error ? <p className="notice error">GitHub sign-in could not be completed. Please try again.</p> : null}
        <form action={githubSignIn}>
          <input type="hidden" name="callbackUrl" value={params.callbackUrl ?? "/dashboard"} />
          <button className="button" type="submit">Continue with GitHub</button>
        </form>
      </section>
    </main>
  );
}
