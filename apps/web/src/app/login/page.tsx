import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import {
  getSessionAuth,
  SESSION_COOKIE_NAME,
} from "@/lib/session";

export default async function LoginPage() {
  const cookieStore = await cookies();

  if (
    await getSessionAuth(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  ) {
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
        <h1>Open your library</h1>
        <p>Sign in with the account created from your workspace invitation.</p>
        <LoginForm />
      </section>
    </main>
  );
}
