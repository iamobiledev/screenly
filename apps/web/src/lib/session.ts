import { createHmac, timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { getDb } from "@/db";
import { users, type WorkspaceRole } from "@/db/schema";
import { getUserWorkspace } from "@/features/auth/users";

export const SESSION_COOKIE_NAME = "screenly_workspace";
export const SESSION_DURATION_SECONDS = 30 * 24 * 60 * 60;

export type WebSessionPayload = {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  expiresAt: number;
};

export type RequestAuth = {
  user: {
    id: string;
    username: string;
    email: string;
  };
  workspace: {
    id: string;
    name: string;
    slug: string;
    role: WorkspaceRole;
  };
};

export function createSessionToken(
  session: Omit<WebSessionPayload, "expiresAt">,
) {
  const expiresAt = Math.floor(Date.now() / 1_000) + SESSION_DURATION_SECONDS;
  const payload = Buffer.from(
    JSON.stringify({ ...session, expiresAt }),
    "utf8",
  ).toString("base64url");

  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined) {
  if (!token) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [payload, signature] = parts;
  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = sign(payload);
  const expected = Buffer.from(expectedSignature);
  const received = Buffer.from(signature);

  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    return null;
  }

  try {
    const session = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Partial<WebSessionPayload>;

    if (
      typeof session.userId === "string" &&
      typeof session.workspaceId === "string" &&
      isWorkspaceRole(session.role) &&
      typeof session.expiresAt === "number" &&
      session.expiresAt > Math.floor(Date.now() / 1_000)
    ) {
      return session as WebSessionPayload;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Reads the session from the request cookies of the current server
 * component render. Returns null for signed-out visitors.
 */
export async function getCookieSessionAuth() {
  const cookieStore = await cookies();
  return getSessionAuth(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

export async function getRequestAuth(request: Request) {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  return getSessionAuth(cookies.get(SESSION_COOKIE_NAME));
}

export async function getSessionAuth(token: string | undefined) {
  const payload = verifySessionToken(token);
  if (!payload) {
    return null;
  }

  const [userRows, workspace] = await Promise.all([
    getDb()
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1),
    getUserWorkspace(payload.userId, payload.workspaceId),
  ]);
  const user = userRows[0];

  if (!user || !workspace) {
    return null;
  }

  return { user, workspace } satisfies RequestAuth;
}

export function workspaceUnauthorizedResponse() {
  return Response.json(
    {
      error: {
        code: "authentication_required",
        message: "Sign in to access the team library.",
      },
    },
    { status: 401 },
  );
}

export function workspaceForbiddenResponse() {
  return Response.json(
    {
      error: {
        code: "forbidden",
        message: "Owner or admin access is required.",
      },
    },
    { status: 403 },
  );
}

function sign(payload: string) {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }

  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function parseCookieHeader(header: string | null) {
  const values = new Map<string, string>();

  for (const part of header?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator < 0) {
      continue;
    }

    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try {
      values.set(name, decodeURIComponent(value));
    } catch {
      continue;
    }
  }

  return values;
}

function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return value === "owner" || value === "admin" || value === "member";
}
