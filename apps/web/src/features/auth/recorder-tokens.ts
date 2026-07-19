import { createHash, randomBytes } from "node:crypto";

import { and, desc, eq, isNull, lt, or } from "drizzle-orm";

import { getDb } from "@/db";
import { recorderTokens } from "@/db/schema";

const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1_000;

export async function createRecorderToken(name: string) {
  const secret = randomBytes(32).toString("base64url");
  const prefix = secret.slice(0, 8);
  const token = `screenly_${prefix}_${secret}`;
  const [record] = await getDb()
    .insert(recorderTokens)
    .values({
      name,
      tokenPrefix: prefix,
      tokenHash: hashToken(token),
    })
    .returning({
      id: recorderTokens.id,
      name: recorderTokens.name,
      tokenPrefix: recorderTokens.tokenPrefix,
      createdAt: recorderTokens.createdAt,
    });

  if (!record) {
    throw new Error("The recorder token could not be created.");
  }

  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    token,
  };
}

export async function listRecorderTokens() {
  const rows = await getDb()
    .select({
      id: recorderTokens.id,
      name: recorderTokens.name,
      tokenPrefix: recorderTokens.tokenPrefix,
      createdAt: recorderTokens.createdAt,
      lastUsedAt: recorderTokens.lastUsedAt,
    })
    .from(recorderTokens)
    .where(isNull(recorderTokens.revokedAt))
    .orderBy(desc(recorderTokens.createdAt));

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  }));
}

export async function revokeRecorderToken(id: string) {
  const [record] = await getDb()
    .update(recorderTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(recorderTokens.id, id), isNull(recorderTokens.revokedAt)),
    )
    .returning({ id: recorderTokens.id });

  return Boolean(record);
}

export async function authenticateRecorderToken(token: string) {
  const [record] = await getDb()
    .select({
      id: recorderTokens.id,
      name: recorderTokens.name,
      lastUsedAt: recorderTokens.lastUsedAt,
    })
    .from(recorderTokens)
    .where(
      and(
        eq(recorderTokens.tokenHash, hashToken(token)),
        isNull(recorderTokens.revokedAt),
      ),
    )
    .limit(1);

  if (!record) {
    return null;
  }

  const staleBefore = new Date(Date.now() - LAST_USED_WRITE_INTERVAL_MS);
  await getDb()
    .update(recorderTokens)
    .set({ lastUsedAt: new Date() })
    .where(
      and(
        eq(recorderTokens.id, record.id),
        or(
          isNull(recorderTokens.lastUsedAt),
          lt(recorderTokens.lastUsedAt, staleBefore),
        ),
      ),
    );

  return { name: record.name };
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
