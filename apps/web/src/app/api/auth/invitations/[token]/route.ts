import { NextResponse } from "next/server";
import { z } from "zod";

import {
  acceptWorkspaceInvitation,
  getInvitation,
} from "@/features/auth/invitations";
import { apiErrorResponse } from "@/lib/api";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
} from "@/lib/session";

export const runtime = "nodejs";

const acceptanceSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(12).max(1_024),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const invitation = await getInvitation(token);
    return invitation
      ? Response.json({
          email: invitation.email,
          role: invitation.role,
          workspaceName: invitation.workspaceName,
          expiresAt: invitation.expiresAt.toISOString(),
        })
      : invalidInvitationResponse();
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const input = acceptanceSchema.parse(await request.json());
    const result = await acceptWorkspaceInvitation({ token, ...input });
    const response = NextResponse.json({
      authenticated: true,
      user: result.user,
      activeWorkspace: result.workspace,
    });
    response.cookies.set(
      SESSION_COOKIE_NAME,
      createSessionToken({
        userId: result.user.id,
        workspaceId: result.workspace.id,
        role: result.workspace.role,
      }),
      {
        httpOnly: true,
        maxAge: SESSION_DURATION_SECONDS,
        path: "/",
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
      },
    );
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}

function invalidInvitationResponse() {
  return Response.json(
    {
      error: {
        code: "invitation_invalid",
        message: "This invitation is invalid, expired, or already used.",
      },
    },
    { status: 410 },
  );
}
