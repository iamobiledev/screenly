import { randomBytes } from "node:crypto";

import { and, desc, eq, gt, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import {
  users,
  workspaceInvitations,
  workspaceMembers,
  workspaces,
  type WorkspaceRole,
} from "@/db/schema";

import { hashOpaqueToken } from "./device-sessions";
import { assertValidPassword, hashPassword, verifyPassword } from "./password";
import { normalizeEmail, normalizeUsername } from "./users";

const INVITATION_DURATION_MS = 7 * 24 * 60 * 60 * 1_000;

export class InvitationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function listWorkspaceAccess(workspaceId: string) {
  const [memberRows, invitationRows] = await Promise.all([
    getDb()
      .select({
        userId: users.id,
        username: users.username,
        email: users.email,
        role: workspaceMembers.role,
        joinedAt: workspaceMembers.joinedAt,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspaceId))
      .orderBy(workspaceMembers.joinedAt),
    getDb()
      .select({
        id: workspaceInvitations.id,
        email: workspaceInvitations.email,
        role: workspaceInvitations.role,
        expiresAt: workspaceInvitations.expiresAt,
        acceptedAt: workspaceInvitations.acceptedAt,
        revokedAt: workspaceInvitations.revokedAt,
        emailStatus: workspaceInvitations.emailStatus,
        failureReason: workspaceInvitations.failureReason,
        createdAt: workspaceInvitations.createdAt,
      })
      .from(workspaceInvitations)
      .where(eq(workspaceInvitations.workspaceId, workspaceId))
      .orderBy(desc(workspaceInvitations.createdAt)),
  ]);

  return {
    members: memberRows.map((member) => ({
      ...member,
      joinedAt: member.joinedAt.toISOString(),
    })),
    invitations: invitationRows.map((invitation) => ({
      ...invitation,
      expiresAt: invitation.expiresAt.toISOString(),
      acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
      revokedAt: invitation.revokedAt?.toISOString() ?? null,
      createdAt: invitation.createdAt.toISOString(),
    })),
  };
}

export async function createWorkspaceInvitation(input: {
  workspaceId: string;
  workspaceName: string;
  email: string;
  role: WorkspaceRole;
  invitedByUserId: string;
  appUrl: string;
}) {
  const email = normalizeEmail(input.email);
  const token = createInvitationToken();
  const expiresAt = new Date(Date.now() + INVITATION_DURATION_MS);
  const createdAt = new Date();
  const [invitation] = await getDb()
    .insert(workspaceInvitations)
    .values({
      workspaceId: input.workspaceId,
      email,
      role: input.role,
      tokenHash: hashOpaqueToken(token),
      invitedByUserId: input.invitedByUserId,
      expiresAt,
      createdAt,
    })
    .returning({ id: workspaceInvitations.id });

  if (!invitation) {
    throw new Error("The invitation could not be created.");
  }

  const inviteUrl = invitationUrl(input.appUrl, token);
  const delivery = await deliverInvitationEmail({
    email,
    workspaceName: input.workspaceName,
    inviteUrl,
  });
  await updateDelivery(invitation.id, delivery);

  return {
    id: invitation.id,
    email,
    role: input.role,
    expiresAt: expiresAt.toISOString(),
    acceptedAt: null,
    revokedAt: null,
    createdAt: createdAt.toISOString(),
    inviteUrl,
    emailStatus: delivery.status,
    failureReason: delivery.failureReason,
  };
}

export async function resendWorkspaceInvitation(input: {
  invitationId: string;
  workspaceId: string;
  workspaceName: string;
  appUrl: string;
}) {
  const token = createInvitationToken();
  const expiresAt = new Date(Date.now() + INVITATION_DURATION_MS);
  const [invitation] = await getDb()
    .update(workspaceInvitations)
    .set({
      tokenHash: hashOpaqueToken(token),
      expiresAt,
      emailStatus: "queued",
      failureReason: null,
      resendEmailId: null,
    })
    .where(
      and(
        eq(workspaceInvitations.id, input.invitationId),
        eq(workspaceInvitations.workspaceId, input.workspaceId),
        isNull(workspaceInvitations.acceptedAt),
        isNull(workspaceInvitations.revokedAt),
      ),
    )
    .returning({
      id: workspaceInvitations.id,
      email: workspaceInvitations.email,
      role: workspaceInvitations.role,
      createdAt: workspaceInvitations.createdAt,
    });

  if (!invitation) {
    return null;
  }

  const inviteUrl = invitationUrl(input.appUrl, token);
  const delivery = await deliverInvitationEmail({
    email: invitation.email,
    workspaceName: input.workspaceName,
    inviteUrl,
  });
  await updateDelivery(invitation.id, delivery);

  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    expiresAt: expiresAt.toISOString(),
    acceptedAt: null,
    revokedAt: null,
    createdAt: invitation.createdAt.toISOString(),
    inviteUrl,
    emailStatus: delivery.status,
    failureReason: delivery.failureReason,
  };
}

export async function revokeWorkspaceInvitation(
  workspaceId: string,
  invitationId: string,
) {
  const [invitation] = await getDb()
    .update(workspaceInvitations)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(workspaceInvitations.id, invitationId),
        eq(workspaceInvitations.workspaceId, workspaceId),
        isNull(workspaceInvitations.acceptedAt),
        isNull(workspaceInvitations.revokedAt),
      ),
    )
    .returning({ id: workspaceInvitations.id });

  return Boolean(invitation);
}

export async function getInvitation(token: string) {
  const [invitation] = await getDb()
    .select({
      id: workspaceInvitations.id,
      email: workspaceInvitations.email,
      role: workspaceInvitations.role,
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      workspaceSlug: workspaces.slug,
      expiresAt: workspaceInvitations.expiresAt,
    })
    .from(workspaceInvitations)
    .innerJoin(workspaces, eq(workspaces.id, workspaceInvitations.workspaceId))
    .where(
      and(
        eq(workspaceInvitations.tokenHash, hashOpaqueToken(token)),
        isNull(workspaceInvitations.acceptedAt),
        isNull(workspaceInvitations.revokedAt),
        gt(workspaceInvitations.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return invitation ?? null;
}

export async function acceptWorkspaceInvitation(input: {
  token: string;
  username: string;
  password: string;
}) {
  const invitation = await getInvitation(input.token);
  if (!invitation) {
    throw new InvitationError(
      "invitation_invalid",
      "This invitation is invalid, expired, or already used.",
      410,
    );
  }

  const username = normalizeUsername(input.username);
  const [existingUser] = await getDb()
    .select()
    .from(users)
    .where(eq(users.email, invitation.email))
    .limit(1);

  let user: { id: string; username: string; email: string };
  if (existingUser) {
    if (
      existingUser.username !== username ||
      !(await verifyPassword(input.password, existingUser.passwordHash))
    ) {
      throw new InvitationError(
        "invalid_credentials",
        "Use the username and password for the account with this email.",
        401,
      );
    }
    user = existingUser;
  } else {
    assertValidUsername(username);
    assertValidPassword(input.password);
    const passwordHash = await hashPassword(input.password);

    try {
      const [createdUser] = await getDb()
        .insert(users)
        .values({
          username,
          email: invitation.email,
          passwordHash,
        })
        .returning({
          id: users.id,
          username: users.username,
          email: users.email,
        });
      if (!createdUser) {
        throw new Error("The user account could not be created.");
      }
      user = createdUser;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new InvitationError(
          "username_unavailable",
          "That username is already in use.",
          409,
        );
      }
      throw error;
    }
  }

  const [accepted] = await getDb()
    .update(workspaceInvitations)
    .set({ acceptedAt: new Date() })
    .where(
      and(
        eq(workspaceInvitations.id, invitation.id),
        eq(
          workspaceInvitations.tokenHash,
          hashOpaqueToken(input.token),
        ),
        isNull(workspaceInvitations.acceptedAt),
        isNull(workspaceInvitations.revokedAt),
        gt(workspaceInvitations.expiresAt, new Date()),
      ),
    )
    .returning({ id: workspaceInvitations.id });

  if (!accepted) {
    throw new InvitationError(
      "invitation_invalid",
      "This invitation has already been used.",
      410,
    );
  }

  await getDb()
    .insert(workspaceMembers)
    .values({
      workspaceId: invitation.workspaceId,
      userId: user.id,
      role: invitation.role,
    })
    .onConflictDoNothing();

  return {
    user,
    workspace: {
      id: invitation.workspaceId,
      name: invitation.workspaceName,
      slug: invitation.workspaceSlug,
      role: invitation.role,
    },
  };
}

function assertValidUsername(username: string) {
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username)) {
    throw new InvitationError(
      "invalid_username",
      "Username must be 3–64 lowercase letters, numbers, dots, dashes, or underscores.",
      400,
    );
  }
}

function createInvitationToken() {
  return randomBytes(32).toString("base64url");
}

function invitationUrl(appUrl: string, token: string) {
  return `${appUrl.replace(/\/$/, "")}/invite/${encodeURIComponent(token)}`;
}

async function deliverInvitationEmail(input: {
  email: string;
  workspaceName: string;
  inviteUrl: string;
}): Promise<{
  status: "sent" | "failed";
  emailId: string | null;
  failureReason: string | null;
}> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    return {
      status: "failed",
      emailId: null,
      failureReason: "Resend email delivery is not configured.",
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.email],
        subject: `Join ${input.workspaceName} on Screenly`,
        text: `You have been invited to ${input.workspaceName} on Screenly.\n\nAccept the invitation: ${input.inviteUrl}\n\nThis link expires in 7 days.`,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };
    if (!response.ok || !result.id) {
      return {
        status: "failed",
        emailId: null,
        failureReason: (result.message ?? "Resend rejected the email.").slice(
          0,
          1_000,
        ),
      };
    }

    return { status: "sent", emailId: result.id, failureReason: null };
  } catch (error) {
    return {
      status: "failed",
      emailId: null,
      failureReason: (
        error instanceof Error ? error.message : "Email delivery failed."
      ).slice(0, 1_000),
    };
  }
}

function updateDelivery(
  invitationId: string,
  delivery: {
    status: "sent" | "failed";
    emailId: string | null;
    failureReason: string | null;
  },
) {
  return getDb()
    .update(workspaceInvitations)
    .set({
      emailStatus: delivery.status,
      resendEmailId: delivery.emailId,
      failureReason: delivery.failureReason,
    })
    .where(eq(workspaceInvitations.id, invitationId));
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}
