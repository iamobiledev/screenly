import { createSign } from "node:crypto";

import { z } from "zod";

/**
 * Obtains Google Cloud access tokens without any Google SDK.
 *
 * Two environments are supported:
 * - Anywhere (Vercel, local, CI): set GCP_SERVICE_ACCOUNT_KEY to a service
 *   account key JSON. A signed JWT is exchanged for an OAuth access token.
 * - Google Cloud (Cloud Run): without the key, the instance metadata server
 *   provides tokens for the attached service account.
 */

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const TOKEN_LIFETIME_SECONDS = 3_600;
const EXPIRY_SAFETY_WINDOW_MS = 5 * 60 * 1_000;

const serviceAccountKeySchema = z.object({
  client_email: z.string().min(1),
  private_key: z.string().min(1),
  token_uri: z.string().optional(),
});

export type ServiceAccountKey = z.infer<typeof serviceAccountKeySchema>;

export function parseServiceAccountKey(raw: string): ServiceAccountKey {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("GCP_SERVICE_ACCOUNT_KEY is not valid JSON.");
  }

  const result = serviceAccountKeySchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      "GCP_SERVICE_ACCOUNT_KEY must contain client_email and private_key.",
    );
  }

  return result.data;
}

/**
 * Builds the signed RS256 assertion for the OAuth 2.0 JWT bearer flow.
 * Exported separately so it can be unit tested with a generated key pair.
 */
export function createServiceAccountAssertion(
  key: ServiceAccountKey,
  nowSeconds = Math.floor(Date.now() / 1_000),
) {
  const header = base64UrlEncodeJSON({ alg: "RS256", typ: "JWT" });
  const audience = key.token_uri ?? GOOGLE_TOKEN_URL;
  const payload = base64UrlEncodeJSON({
    iss: key.client_email,
    sub: key.client_email,
    scope: CLOUD_PLATFORM_SCOPE,
    aud: audience,
    iat: nowSeconds,
    exp: nowSeconds + TOKEN_LIFETIME_SECONDS,
  });

  const signingInput = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256")
    .update(signingInput)
    .sign(key.private_key, "base64url");

  return `${signingInput}.${signature}`;
}

function base64UrlEncodeJSON(value: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

type CachedToken = {
  accessToken: string;
  expiresAtMs: number;
};

let cachedToken: CachedToken | undefined;

export async function getGoogleAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAtMs > Date.now()) {
    return cachedToken.accessToken;
  }

  const rawKey = process.env.GCP_SERVICE_ACCOUNT_KEY;
  const token = rawKey
    ? await exchangeServiceAccountAssertion(parseServiceAccountKey(rawKey))
    : await getMetadataAccessToken();

  cachedToken = {
    accessToken: token.accessToken,
    expiresAtMs:
      Date.now() + token.expiresInSeconds * 1_000 - EXPIRY_SAFETY_WINDOW_MS,
  };

  return cachedToken.accessToken;
}

async function exchangeServiceAccountAssertion(key: ServiceAccountKey) {
  const response = await fetch(key.token_uri ?? GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: createServiceAccountAssertion(key),
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Service account token exchange failed (${response.status}): ${await response.text()}`,
    );
  }

  const result = (await response.json()) as {
    access_token?: unknown;
    expires_in?: unknown;
  };
  if (typeof result.access_token !== "string") {
    throw new Error("Google returned an invalid access token.");
  }

  return {
    accessToken: result.access_token,
    expiresInSeconds:
      typeof result.expires_in === "number"
        ? result.expires_in
        : TOKEN_LIFETIME_SECONDS,
  };
}

async function getMetadataAccessToken() {
  const response = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    {
      headers: { "Metadata-Flavor": "Google" },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(
      `Could not obtain a Cloud Run identity token (${response.status}).`,
    );
  }

  const result = (await response.json()) as {
    access_token?: unknown;
    expires_in?: unknown;
  };
  if (typeof result.access_token !== "string") {
    throw new Error("The metadata server returned an invalid access token.");
  }

  return {
    accessToken: result.access_token,
    expiresInSeconds:
      typeof result.expires_in === "number"
        ? result.expires_in
        : TOKEN_LIFETIME_SECONDS,
  };
}
