import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserWorkspace } from "@/features/auth/users";
import { apiErrorResponse } from "@/lib/api";
import {
  createSessionToken,
  getRequestAuth,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
  workspaceUnauthorizedResponse,
} from "@/lib/session";

export const runtime = "nodejs";

const switchWorkspaceSchema = z.object({
  workspaceId: z.uuid(),
});

export async function POST(request: Request) {
  const authentication = await getRequestAuth(request);
  if (!authentication) {
    return workspaceUnauthorizedResponse();
  }

  try {
    const { workspaceId } = switchWorkspaceSchema.parse(await request.json());
    const activeWorkspace = await getUserWorkspace(
      authentication.user.id,
      workspaceId,
    );
    if (!activeWorkspace) {
      return Response.json(
        {
          error: {
            code: "workspace_not_found",
            message: "You are not a member of that workspace.",
          },
        },
        { status: 404 },
      );
    }

    const response = NextResponse.json({ activeWorkspace });
    response.cookies.set(
      SESSION_COOKIE_NAME,
      createSessionToken({
        userId: authentication.user.id,
        workspaceId: activeWorkspace.id,
        role: activeWorkspace.role,
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
