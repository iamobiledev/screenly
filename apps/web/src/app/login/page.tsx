import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/session";

export default async function LoginPage() {
  const cookieStore = await cookies();

  if (verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value)) {
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
        <p>Use the shared workspace password provided by your team admin.</p>
        <LoginForm />
      </section>
    </main>
  );
}
