import assert from "node:assert/strict";
import test from "node:test";

import {
  runWorkerLoop,
  type WorkerLoopEvent,
} from "./worker-loop.js";

test("worker loop polls until work is available", async () => {
  const controller = new AbortController();
  const processed: string[] = [];
  const claims: Array<string | null> = [null, "video-1"];
  let sleeps = 0;

  await runWorkerLoop({
    claim: async () => claims.shift() ?? null,
    process: async (work) => {
      processed.push(work);
      controller.abort();
    },
    reclaim: async () => null,
    pollIntervalMs: 1_000,
    maxAttempts: 4,
    signal: controller.signal,
    log: () => {},
    sleep: async () => {
      sleeps += 1;
    },
  });

  assert.deepEqual(processed, ["video-1"]);
  assert.equal(sleeps, 1);
});

test("worker loop recovers from a transient claim failure", async () => {
  const controller = new AbortController();
  const events: WorkerLoopEvent[] = [];
  let claimAttempts = 0;

  await runWorkerLoop({
    claim: async () => {
      claimAttempts += 1;
      if (claimAttempts === 1) {
        throw new Error("database unavailable");
      }
      return "video-1";
    },
    process: async () => {
      controller.abort();
    },
    reclaim: async () => null,
    pollIntervalMs: 1_000,
    maxAttempts: 4,
    signal: controller.signal,
    log: (event) => events.push(event),
    sleep: async () => {},
  });

  assert.equal(claimAttempts, 2);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.type, "claim_failed");
});

test("worker loop bounds retries and continues to later work", async () => {
  const controller = new AbortController();
  const events: WorkerLoopEvent[] = [];
  const claims = ["bad-video", "good-video"];
  let badAttempts = 0;
  let goodAttempts = 0;

  await runWorkerLoop({
    claim: async () => claims.shift() ?? null,
    process: async (work) => {
      if (work === "bad-video") {
        badAttempts += 1;
        throw new Error("invalid media");
      }
      goodAttempts += 1;
      controller.abort();
    },
    reclaim: async (work) => work,
    pollIntervalMs: 100,
    maxAttempts: 3,
    signal: controller.signal,
    log: (event) => events.push(event),
    sleep: async () => {},
  });

  assert.equal(badAttempts, 3);
  assert.equal(goodAttempts, 1);
  assert.deepEqual(
    events.map((event) => event.type),
    [
      "processing_attempt_failed",
      "processing_attempt_failed",
      "processing_attempt_failed",
    ],
  );
});

test("worker loop continues when a failed video cannot be reclaimed", async () => {
  const controller = new AbortController();
  const events: WorkerLoopEvent<string>[] = [];
  const claims = ["bad-video", "good-video"];

  await runWorkerLoop({
    claim: async () => claims.shift() ?? null,
    process: async (work) => {
      if (work === "bad-video") {
        throw new Error("invalid media");
      }
      controller.abort();
    },
    reclaim: async () => {
      throw new Error("database interrupted");
    },
    pollIntervalMs: 100,
    maxAttempts: 3,
    signal: controller.signal,
    log: (event) => events.push(event),
    sleep: async () => {},
  });

  assert.deepEqual(
    events.map((event) => event.type),
    ["processing_attempt_failed", "reclaim_failed"],
  );
});

test("worker loop exits cleanly when stopped while idle", async () => {
  const controller = new AbortController();
  let claims = 0;

  await runWorkerLoop({
    claim: async () => {
      claims += 1;
      return null;
    },
    process: async () => {
      throw new Error("No work should be processed.");
    },
    reclaim: async () => null,
    pollIntervalMs: 1_000,
    maxAttempts: 4,
    signal: controller.signal,
    log: () => {},
    sleep: async () => {
      controller.abort();
    },
  });

  assert.equal(claims, 1);
});
