import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse } from "@/lib/api";
import {
  createSessionToken,
  getRequestAuth,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
} from "@/lib/session";
import {
  authenticateCredentials,
  listUserWorkspaces,
} from "@/features/auth/users";

export const runtime = "nodejs";

const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(1_024),
});

export async function GET(request: Request) {
  const authentication = await getRequestAuth(request);
  if (!authentication) {
    return Response.json({ authenticated: false });
  }

  return Response.json({
    authenticated: true,
    user: authentication.user,
    activeWorkspace: authentication.workspace,
    workspaces: await listUserWorkspaces(authentication.user.id),
  });
}

export async function POST(request: Request) {
  try {
    const { username, password } = loginSchema.parse(await request.json());
    const user = await authenticateCredentials(username, password);
    const memberships = user ? await listUserWorkspaces(user.id) : [];
    const activeWorkspace = memberships[0];

    if (!user || !activeWorkspace) {
      return Response.json(
        {
          error: {
            code: "invalid_credentials",
            message: "The username or password is incorrect.",
          },
        },
        { status: 401 },
      );
    }

    const response = NextResponse.json({
      authenticated: true,
      user,
      activeWorkspace,
      workspaces: memberships,
    });
    response.cookies.set(
      SESSION_COOKIE_NAME,
      createSessionToken({
        userId: user.id,
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

export function DELETE() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
