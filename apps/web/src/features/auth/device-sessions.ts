import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { users, userSessions } from "@/db/schema";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1_000;

export async function createDeviceSession(userId: string, deviceName: string) {
  const token = `screenly_user_${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const [session] = await getDb()
    .insert(userSessions)
    .values({
      userId,
      tokenHash: hashOpaqueToken(token),
      deviceName,
      expiresAt,
    })
    .returning({ id: userSessions.id });

  if (!session) {
    throw new Error("The device session could not be created.");
  }

  return { token, expiresAt: expiresAt.toISOString() };
}

export async function authenticateDeviceRequest(request: Request) {
  const token = readBearerToken(request);
  if (!token) {
    return null;
  }

  const [session] = await getDb()
    .select({
      id: userSessions.id,
      userId: userSessions.userId,
      username: users.username,
      email: users.email,
      expiresAt: userSessions.expiresAt,
    })
    .from(userSessions)
    .innerJoin(users, eq(users.id, userSessions.userId))
    .where(
      and(
        eq(userSessions.tokenHash, hashOpaqueToken(token)),
        isNull(userSessions.revokedAt),
        gt(userSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!session) {
    return null;
  }

  await getDb()
    .update(userSessions)
    .set({ lastUsedAt: new Date() })
    .where(eq(userSessions.id, session.id));

  return {
    sessionId: session.id,
    user: {
      id: session.userId,
      username: session.username,
      email: session.email,
    },
    expiresAt: session.expiresAt.toISOString(),
  };
}

export async function revokeDeviceSession(request: Request) {
  const token = readBearerToken(request);
  if (!token) {
    return false;
  }

  const [session] = await getDb()
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(userSessions.tokenHash, hashOpaqueToken(token)),
        isNull(userSessions.revokedAt),
      ),
    )
    .returning({
      id: userSessions.id,
      userId: userSessions.userId,
      deviceName: userSessions.deviceName,
    });

  return session ?? null;
}

export function hashOpaqueToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function deviceUnauthorizedResponse() {
  return Response.json(
    {
      error: {
        code: "authentication_required",
        message: "A valid user session token is required.",
      },
    },
    { status: 401 },
  );
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;
}
