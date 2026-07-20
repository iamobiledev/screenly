import { z } from "zod";

import { createWorkspaceInvitation } from "@/features/auth/invitations";
import { canManageWorkspace } from "@/features/auth/users";
import { apiErrorResponse } from "@/lib/api";
import {
  getRequestAuth,
  workspaceForbiddenResponse,
  workspaceUnauthorizedResponse,
} from "@/lib/session";

export const runtime = "nodejs";

const invitationSchema = z.object({
  email: z.email().max(320),
  role: z.enum(["owner", "admin", "member"]).default("member"),
});

export async function POST(request: Request) {
  const authentication = await getRequestAuth(request);
  if (!authentication) {
    return workspaceUnauthorizedResponse();
  }
  if (!canManageWorkspace(authentication.workspace.role)) {
    return workspaceForbiddenResponse();
  }

  try {
    const input = invitationSchema.parse(await request.json());
    if (
      authentication.workspace.role === "admin" &&
      input.role !== "member"
    ) {
      return workspaceForbiddenResponse();
    }

    const appUrl = (
      process.env.APP_URL ?? new URL(request.url).origin
    ).replace(/\/$/, "");
    const invitation = await createWorkspaceInvitation({
      ...input,
      workspaceId: authentication.workspace.id,
      workspaceName: authentication.workspace.name,
      invitedByUserId: authentication.user.id,
      appUrl,
    });
    return Response.json(invitation, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
