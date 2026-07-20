"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

type Member = {
  userId: string;
  username: string;
  email: string;
  role: "owner" | "admin" | "member";
  joinedAt: string;
};

type Invitation = {
  id: string;
  email: string;
  role: "owner" | "admin" | "member";
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  emailStatus: "queued" | "sent" | "failed";
  failureReason: string | null;
  createdAt: string;
};

export function MemberManager({
  members,
  invitations,
  currentRole,
}: {
  members: Member[];
  invitations: Invitation[];
  currentRole: "owner" | "admin";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInviteUrl(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/library/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        role: form.get("role"),
      }),
    });
    const result = (await response.json()) as {
      inviteUrl?: string;
      error?: { message?: string };
    };
    if (!response.ok || !result.inviteUrl) {
      setError(result.error?.message ?? "Could not create the invitation.");
      return;
    }

    setInviteUrl(result.inviteUrl);
    event.currentTarget.reset();
    startTransition(() => router.refresh());
  }

  async function updateInvitation(id: string, action: "resend" | "revoke") {
    setError(null);
    setInviteUrl(null);
    const response = await fetch(`/api/library/invitations/${id}`, {
      method: action === "resend" ? "POST" : "DELETE",
    });
    if (!response.ok) {
      setError(`Could not ${action} the invitation.`);
      return;
    }

    if (action === "resend") {
      const result = (await response.json()) as { inviteUrl: string };
      setInviteUrl(result.inviteUrl);
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className={isPending ? "member-manager is-pending" : "member-manager"}>
      <form className="invite-form" onSubmit={invite}>
        <input
          aria-label="Invitee email"
          name="email"
          placeholder="teammate@example.com"
          required
          type="email"
        />
        <select aria-label="Workspace role" name="role" defaultValue="member">
          <option value="member">Member</option>
          {currentRole === "owner" ? (
            <option value="admin">Admin</option>
          ) : null}
          {currentRole === "owner" ? (
            <option value="owner">Owner</option>
          ) : null}
        </select>
        <button className="primary-button" type="submit">
          Send invitation
        </button>
      </form>

      {inviteUrl ? (
        <div className="new-token-panel" role="status">
          <div>
            <strong>Invitation link</strong>
            <p>Copy this link if email delivery is unavailable.</p>
          </div>
          <code>{inviteUrl}</code>
          <button
            className="secondary-button"
            type="button"
            onClick={() => navigator.clipboard.writeText(inviteUrl)}
          >
            Copy link
          </button>
        </div>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}

      <section className="access-section">
        <h2>Members</h2>
        {members.map((member) => (
          <div className="token-row" key={member.userId}>
            <div>
              <strong>{member.username}</strong>
              <p>{member.email}</p>
            </div>
            <span>{member.role}</span>
          </div>
        ))}
      </section>

      <section className="access-section">
        <h2>Invitations</h2>
        {invitations.map((invitation) => {
          const active = !invitation.acceptedAt && !invitation.revokedAt;
          return (
            <div className="token-row" key={invitation.id}>
              <div>
                <strong>{invitation.email}</strong>
                <p>
                  {invitation.role} · {invitation.emailStatus}
                  {invitation.failureReason
                    ? ` · ${invitation.failureReason}`
                    : ""}
                </p>
              </div>
              {active ? (
                <div>
                  <button
                    type="button"
                    onClick={() =>
                      updateInvitation(invitation.id, "resend")
                    }
                  >
                    Resend
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateInvitation(invitation.id, "revoke")
                    }
                  >
                    Revoke
                  </button>
                </div>
              ) : (
                <span>{invitation.acceptedAt ? "Accepted" : "Revoked"}</span>
              )}
            </div>
          );
        })}
        {invitations.length === 0 ? (
          <div className="empty-token-list">No invitations yet.</div>
        ) : null}
      </section>
    </div>
  );
}
