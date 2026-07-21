import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { getCookieSessionAuth } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCookieSessionAuth()) {
    redirect("/library");
  }

  return (
    <main className="login-shell">
      <Link className="brand" href="/">
        <span className="brand-mark">
          <span />
        </span>
        Screenly
      </Link>
      <section className="login-card">
        <p className="eyebrow">Team access</p>
        <h1>Sign in to Screenly</h1>
        <p>
          Open your library to watch, rename, and share recordings — and see
          who watched them.
        </p>
        <LoginForm />
        <p className="login-footnote">
          No account yet? Ask a workspace admin to send you an invitation from
          the Members page.
        </p>
      </section>
    </main>
  );
}
