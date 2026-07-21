import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  buildSlackUnfurl,
  chatUnfurl,
  parseScreenlyShareUrl,
  verifySlackRequest,
} from "./slack";

test("Slack request verification accepts current signatures and rejects replays", () => {
  const body = '{"type":"url_verification","challenge":"hello"}';
  const timestamp = "1000";
  const signingSecret = "test-signing-secret";
  const signature = `v0=${createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex")}`;

  assert.equal(
    verifySlackRequest({
      body,
      timestamp,
      signature,
      signingSecret,
      nowSeconds: 1_100,
    }),
    true,
  );
  assert.equal(
    verifySlackRequest({
      body,
      timestamp,
      signature,
      signingSecret,
      nowSeconds: 1_301,
    }),
    false,
  );
  assert.equal(
    verifySlackRequest({
      body: `${body} `,
      timestamp,
      signature,
      signingSecret,
      nowSeconds: 1_100,
    }),
    false,
  );
});

test("only exact Screenly share URLs are accepted", () => {
  const appUrl = "https://screenly.example.com";

  assert.equal(
    parseScreenlyShareUrl(
      "https://screenly.example.com/v/Abc_123-xyz",
      appUrl,
    ),
    "Abc_123-xyz",
  );
  assert.equal(
    parseScreenlyShareUrl(
      "https://attacker.example/v/Abc_123-xyz",
      appUrl,
    ),
    null,
  );
  assert.equal(
    parseScreenlyShareUrl(
      "https://screenly.example.com/v/Abc_123-xyz?redirect=1",
      appUrl,
    ),
    null,
  );
});

test("Slack payloads distinguish processing and playable videos", () => {
  const sharedUrl = "https://screenly.example.com/v/abc123";
  const processing = buildSlackUnfurl(
    {
      slug: "abc123",
      title: "Quarterly update",
      recorderName: "Avery",
      status: "processing",
      processingStage: "transcoding",
      progressPercent: 42,
      etaSeconds: 65,
      hasThumbnail: false,
    },
    sharedUrl,
    "https://screenly.example.com",
  );
  assert.match(JSON.stringify(processing), /Optimizing playback · 42%/);

  const ready = buildSlackUnfurl(
    {
      slug: "abc123",
      title: "Quarterly update",
      recorderName: "Avery",
      status: "ready",
      processingStage: "ready",
      progressPercent: 100,
      etaSeconds: null,
      hasThumbnail: true,
    },
    sharedUrl,
    "https://screenly.example.com",
  );
  assert.equal(ready.blocks[0]?.type, "video");
  assert.equal(
    ready.blocks[0]?.video_url,
    "https://screenly.example.com/embed/v/abc123",
  );
  assert.equal(
    ready.blocks[0]?.thumbnail_url,
    "https://screenly.example.com/api/videos/abc123/thumbnail",
  );
});

test("chat.unfurl sends an exact URL-keyed attachment", async () => {
  const requestBodies: Array<Record<string, unknown>> = [];
  const fakeFetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    requestBodies.push(
      JSON.parse(String(init?.body)) as Record<string, unknown>,
    );
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  const sharedUrl = "https://screenly.example.com/v/abc123";

  await chatUnfurl({
    token: "xoxb-test",
    target: {
      channelId: "C123",
      messageTs: "123.456",
      unfurlId: null,
      source: null,
      sharedUrl,
    },
    content: { blocks: [{ type: "section" }] },
    fetchImplementation: fakeFetch,
  });

  const requestBody = requestBodies[0];
  assert.ok(requestBody);
  assert.equal(requestBody.channel, "C123");
  const unfurls = JSON.parse(String(requestBody.unfurls)) as Record<
    string,
    unknown
  >;
  assert.deepEqual(Object.keys(unfurls), [sharedUrl]);
});
