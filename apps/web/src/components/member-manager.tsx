"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useState,
  useTransition,
  type FormEvent,
} from "react";

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
  const [invitationRows, setInvitationRows] = useState(invitations);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setInvitationRows(invitations);
  }, [invitations]);

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
    const result = (await response.json()) as Partial<Invitation> & {
      inviteUrl?: string;
      error?: { message?: string };
    };
    if (
      !response.ok ||
      !result.id ||
      !result.email ||
      !result.role ||
      !result.expiresAt ||
      !result.createdAt ||
      !result.emailStatus ||
      !result.inviteUrl
    ) {
      setError(result.error?.message ?? "Could not create the invitation.");
      return;
    }

    setInvitationRows((current) => [
      {
        id: result.id!,
        email: result.email!,
        role: result.role!,
        expiresAt: result.expiresAt!,
        acceptedAt: result.acceptedAt ?? null,
        revokedAt: result.revokedAt ?? null,
        emailStatus: result.emailStatus!,
        failureReason: result.failureReason ?? null,
        createdAt: result.createdAt!,
      },
      ...current,
    ]);
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
      const result = (await response.json()) as Partial<Invitation> & {
        inviteUrl: string;
      };
      setInvitationRows((current) =>
        current.map((invitation) =>
          invitation.id === id
            ? {
                ...invitation,
                expiresAt: result.expiresAt ?? invitation.expiresAt,
                emailStatus: result.emailStatus ?? invitation.emailStatus,
                failureReason:
                  result.failureReason ?? invitation.failureReason,
              }
            : invitation,
        ),
      );
      setInviteUrl(result.inviteUrl);
    } else {
      setInvitationRows((current) =>
        current.map((invitation) =>
          invitation.id === id
            ? { ...invitation, revokedAt: new Date().toISOString() }
            : invitation,
        ),
      );
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
          <code>{displayInviteUrl(inviteUrl)}</code>
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
        {invitationRows.map((invitation) => {
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
        {invitationRows.length === 0 ? (
          <div className="empty-token-list">No invitations yet.</div>
        ) : null}
      </section>
    </div>
  );
}

function displayInviteUrl(inviteUrl: string) {
  try {
    const url = new URL(inviteUrl);
    const token = url.pathname.split("/").pop() ?? "";
    return `${url.origin}/invite/${token.slice(0, 8)}…`;
  } catch {
    return "Invitation link ready";
  }
}
