import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { test } from "node:test";

import {
  createServiceAccountAssertion,
  parseServiceAccountKey,
} from "./gcp-auth";

function makeKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { privateKey, publicKey };
}

function decodeSegment(segment: string) {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

test("parseServiceAccountKey accepts a valid key JSON", () => {
  const key = parseServiceAccountKey(
    JSON.stringify({
      client_email: "dispatch@example.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----",
      token_uri: "https://oauth2.googleapis.com/token",
    }),
  );

  assert.equal(key.client_email, "dispatch@example.iam.gserviceaccount.com");
});

test("parseServiceAccountKey rejects invalid JSON and missing fields", () => {
  assert.throws(() => parseServiceAccountKey("not-json"), {
    message: /not valid JSON/,
  });
  assert.throws(
    () => parseServiceAccountKey(JSON.stringify({ client_email: "x" })),
    { message: /client_email and private_key/ },
  );
});

test("createServiceAccountAssertion produces a verifiable RS256 JWT", () => {
  const { privateKey, publicKey } = makeKeyPair();
  const nowSeconds = 1_753_000_000;
  const assertion = createServiceAccountAssertion(
    {
      client_email: "dispatch@example.iam.gserviceaccount.com",
      private_key: privateKey,
    },
    nowSeconds,
  );

  const [header, payload, signature] = assertion.split(".");
  assert.ok(header && payload && signature);

  assert.deepEqual(decodeSegment(header), { alg: "RS256", typ: "JWT" });

  const claims = decodeSegment(payload);
  assert.equal(claims.iss, "dispatch@example.iam.gserviceaccount.com");
  assert.equal(claims.sub, "dispatch@example.iam.gserviceaccount.com");
  assert.equal(claims.aud, "https://oauth2.googleapis.com/token");
  assert.equal(claims.scope, "https://www.googleapis.com/auth/cloud-platform");
  assert.equal(claims.iat, nowSeconds);
  assert.equal(claims.exp, nowSeconds + 3_600);

  const verified = createVerify("RSA-SHA256")
    .update(`${header}.${payload}`)
    .verify(publicKey, signature, "base64url");
  assert.equal(verified, true);
});

test("createServiceAccountAssertion honors a custom token_uri audience", () => {
  const { privateKey } = makeKeyPair();
  const assertion = createServiceAccountAssertion({
    client_email: "dispatch@example.iam.gserviceaccount.com",
    private_key: privateKey,
    token_uri: "https://example.test/token",
  });

  const claims = decodeSegment(assertion.split(".")[1]!);
  assert.equal(claims.aud, "https://example.test/token");
});
