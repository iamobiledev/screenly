import { randomBytes, scrypt } from "node:crypto";

import postgres from "postgres";

const DEFAULT_WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

const databaseUrl = required("DATABASE_URL");
const username = required("OWNER_USERNAME").trim().toLowerCase();
const email = required("OWNER_EMAIL").trim().toLowerCase();
const password = required("OWNER_PASSWORD");
const workspaceName = required("WORKSPACE_NAME").trim();

if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username)) {
  throw new Error(
    "OWNER_USERNAME must be 3–64 lowercase letters, numbers, dots, dashes, or underscores.",
  );
}
if (password.length < 12 || password.length > 1_024) {
  throw new Error("OWNER_PASSWORD must contain 12–1,024 characters.");
}
if (!email.includes("@") || email.length > 320) {
  throw new Error("OWNER_EMAIL must be a valid email address.");
}
if (!workspaceName || workspaceName.length > 120) {
  throw new Error("WORKSPACE_NAME must contain 1–120 characters.");
}

const cloudSqlInstance = process.env.CLOUD_SQL_INSTANCE;
const sql = postgres(databaseUrl, {
  max: 1,
  ...(cloudSqlInstance
    ? {
        path: `/cloudsql/${cloudSqlInstance}/.s.PGSQL.5432`,
        ssl: false,
      }
    : {}),
});
const passwordHash = await hashPassword(password);
const matches = await sql`
  select id, username, email
  from users
  where username = ${username} or email = ${email}
`;
if (matches.length > 1) {
  throw new Error(
    "OWNER_USERNAME and OWNER_EMAIL belong to different existing users.",
  );
}

let userId;
if (matches[0]) {
  userId = matches[0].id;
  await sql`
    update users
    set
      username = ${username},
      email = ${email},
      password_hash = ${passwordHash},
      updated_at = now()
    where id = ${userId}::uuid
  `;
} else {
  const rows = await sql`
    insert into users (username, email, password_hash)
    values (${username}, ${email}, ${passwordHash})
    returning id
  `;
  userId = rows[0].id;
}

await sql`
  insert into workspaces (id, name, slug, created_by_user_id)
  values (
    ${DEFAULT_WORKSPACE_ID}::uuid,
    ${workspaceName},
    'default',
    ${userId}::uuid
  )
  on conflict (id) do update
  set
    name = excluded.name,
    created_by_user_id = coalesce(
      workspaces.created_by_user_id,
      excluded.created_by_user_id
    )
`;
await sql`
  insert into workspace_members (workspace_id, user_id, role)
  values (
    ${DEFAULT_WORKSPACE_ID}::uuid,
    ${userId}::uuid,
    'owner'
  )
  on conflict (workspace_id, user_id) do update
  set role = 'owner'
`;

await sql.end({ timeout: 5 });

console.log(
  `Owner ${username} is ready in workspace ${workspaceName} (${DEFAULT_WORKSPACE_ID}).`,
);

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

async function hashPassword(value) {
  const salt = randomBytes(16);
  const derivedKey = await new Promise((resolve, reject) => {
    scrypt(
      value,
      salt,
      64,
      {
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        maxmem: 32 * 1024 * 1024,
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      },
    );
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}
