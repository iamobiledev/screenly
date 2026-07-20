import Link from "next/link";

import { InvitationForm } from "@/components/invitation-form";
import { getInvitation } from "@/features/auth/invitations";

export const dynamic = "force-dynamic";

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitation = await getInvitation(token);

  return (
    <main className="login-shell">
      <Link className="brand" href="/">
        <span className="brand-mark">
          <span />
        </span>
        Screenly
      </Link>
      <section className="login-card">
        <p className="eyebrow">Workspace invitation</p>
        {invitation ? (
          <>
            <h1>Join {invitation.workspaceName}</h1>
            <p>
              Invited as {invitation.email}. Existing users must enter their
              current username and password; new users can choose credentials.
            </p>
            <InvitationForm token={token} />
          </>
        ) : (
          <>
            <h1>Invitation unavailable</h1>
            <p>This invitation is invalid, expired, revoked, or already used.</p>
            <Link className="secondary-button" href="/login">
              Go to sign in
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
