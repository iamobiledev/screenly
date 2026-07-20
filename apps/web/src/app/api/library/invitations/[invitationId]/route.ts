import { z } from "zod";

import {
  resendWorkspaceInvitation,
  revokeWorkspaceInvitation,
} from "@/features/auth/invitations";
import { canManageWorkspace } from "@/features/auth/users";
import { apiErrorResponse } from "@/lib/api";
import {
  getRequestAuth,
  workspaceForbiddenResponse,
  workspaceUnauthorizedResponse,
} from "@/lib/session";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ invitationId: string }> },
) {
  const authentication = await getRequestAuth(request);
  if (!authentication) {
    return workspaceUnauthorizedResponse();
  }
  if (!canManageWorkspace(authentication.workspace.role)) {
    return workspaceForbiddenResponse();
  }

  try {
    const { invitationId: rawInvitationId } = await params;
    const invitationId = z.uuid().parse(rawInvitationId);
    const appUrl = (
      process.env.APP_URL ?? new URL(request.url).origin
    ).replace(/\/$/, "");
    const invitation = await resendWorkspaceInvitation({
      invitationId,
      workspaceId: authentication.workspace.id,
      workspaceName: authentication.workspace.name,
      appUrl,
    });
    return invitation
      ? Response.json(invitation)
      : invitationNotFoundResponse();
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ invitationId: string }> },
) {
  const authentication = await getRequestAuth(request);
  if (!authentication) {
    return workspaceUnauthorizedResponse();
  }
  if (!canManageWorkspace(authentication.workspace.role)) {
    return workspaceForbiddenResponse();
  }

  try {
    const { invitationId: rawInvitationId } = await params;
    const revoked = await revokeWorkspaceInvitation(
      authentication.workspace.id,
      z.uuid().parse(rawInvitationId),
    );
    return revoked
      ? new Response(null, { status: 204 })
      : invitationNotFoundResponse();
  } catch (error) {
    return apiErrorResponse(error);
  }
}

function invitationNotFoundResponse() {
  return Response.json(
    {
      error: {
        code: "invitation_not_found",
        message: "The active invitation does not exist.",
      },
    },
    { status: 404 },
  );
}
