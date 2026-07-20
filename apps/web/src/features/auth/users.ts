import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  users,
  workspaceMembers,
  workspaces,
  type WorkspaceRole,
} from "@/db/schema";

import { verifyPassword } from "./password";

const DUMMY_PASSWORD_HASH = [
  "scrypt",
  "16384",
  "8",
  "1",
  Buffer.alloc(16).toString("base64url"),
  Buffer.alloc(64).toString("base64url"),
].join("$");

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function authenticateCredentials(
  username: string,
  password: string,
) {
  const normalizedUsername = normalizeUsername(username);
  const [user] = await getDb()
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.username, normalizedUsername))
    .limit(1);

  if (!user) {
    await verifyPassword(password, DUMMY_PASSWORD_HASH);
    return null;
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    email: user.email,
  };
}

export async function listUserWorkspaces(userId: string) {
  const rows = await getDb()
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(workspaceMembers.joinedAt);

  return rows;
}

export async function getUserWorkspace(userId: string, workspaceId: string) {
  const [workspace] = await getDb()
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(
      and(
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  return workspace ?? null;
}

export function canManageWorkspace(
  role: WorkspaceRole,
): role is "owner" | "admin" {
  return role === "owner" || role === "admin";
}
