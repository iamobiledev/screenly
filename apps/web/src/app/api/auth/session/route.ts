import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse } from "@/lib/api";
import {
  createSessionToken,
  isRequestAuthenticated,
  isWorkspacePasswordValid,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
} from "@/lib/session";

export const runtime = "nodejs";

const loginSchema = z.object({
  password: z.string().min(1).max(1_024),
});

export async function GET(request: Request) {
  return Response.json({ authenticated: isRequestAuthenticated(request) });
}

export async function POST(request: Request) {
  try {
    const { password } = loginSchema.parse(await request.json());

    if (!isWorkspacePasswordValid(password)) {
      return Response.json(
        {
          error: {
            code: "invalid_credentials",
            message: "The workspace password is incorrect.",
          },
        },
        { status: 401 },
      );
    }

    const response = NextResponse.json({ authenticated: true });
    response.cookies.set(SESSION_COOKIE_NAME, createSessionToken(), {
      httpOnly: true,
      maxAge: SESSION_DURATION_SECONDS,
      path: "/",
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });
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
