import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

export const SESSION_COOKIE_NAME = "screenly_workspace";
export const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60;

export function createSessionToken() {
  const expiresAt = Math.floor(Date.now() / 1_000) + SESSION_DURATION_SECONDS;
  const payload = Buffer.from(
    JSON.stringify({ expiresAt }),
    "utf8",
  ).toString("base64url");

  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined) {
  if (!token) {
    return false;
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return false;
  }

  const expectedSignature = sign(payload);
  const expected = Buffer.from(expectedSignature);
  const received = Buffer.from(signature);

  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    return false;
  }

  try {
    const session = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { expiresAt?: unknown };

    return (
      typeof session.expiresAt === "number" &&
      session.expiresAt > Math.floor(Date.now() / 1_000)
    );
  } catch {
    return false;
  }
}

export function isWorkspacePasswordValid(password: string) {
  const expectedPassword = process.env.WORKSPACE_PASSWORD;

  if (!expectedPassword) {
    throw new Error("WORKSPACE_PASSWORD is not configured.");
  }

  const expected = Buffer.from(expectedPassword);
  const received = Buffer.from(password);

  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

export function isRequestAuthenticated(request: Request) {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  return verifySessionToken(cookies.get(SESSION_COOKIE_NAME));
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
    values.set(name, decodeURIComponent(value));
  }

  return values;
}
