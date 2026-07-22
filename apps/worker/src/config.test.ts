import assert from "node:assert/strict";
import test from "node:test";

import { parseConfig } from "./config.js";

const requiredEnvironment = {
  DATABASE_URL: "postgresql://screenly:secret@localhost:5432/screenly",
  STORAGE_ACCESS_KEY_ID: "screenly",
  STORAGE_BUCKET: "recordings",
  STORAGE_SECRET_ACCESS_KEY: "storage-secret",
};

test("worker config defaults to continuous pool mode", () => {
  const config = parseConfig(requiredEnvironment);

  assert.equal(config.VIDEO_ID, undefined);
  assert.equal(config.WORKER_POLL_INTERVAL_MS, 1_000);
  assert.equal(config.PROCESSING_MAX_ATTEMPTS, 4);
});

test("worker config preserves one-shot video mode", () => {
  const config = parseConfig({
    ...requiredEnvironment,
    VIDEO_ID: "6998b3eb-6a0c-4f87-a28d-ae96ea45162b",
    WORKER_POLL_INTERVAL_MS: "250",
    PROCESSING_MAX_ATTEMPTS: "2",
  });

  assert.equal(config.VIDEO_ID, "6998b3eb-6a0c-4f87-a28d-ae96ea45162b");
  assert.equal(config.WORKER_POLL_INTERVAL_MS, 250);
  assert.equal(config.PROCESSING_MAX_ATTEMPTS, 2);
});

test("worker config treats an empty video ID as pool mode", () => {
  const config = parseConfig({
    ...requiredEnvironment,
    VIDEO_ID: "",
  });

  assert.equal(config.VIDEO_ID, undefined);
});

test("worker config rejects unsafe polling and retry settings", () => {
  assert.throws(
    () =>
      parseConfig({
        ...requiredEnvironment,
        WORKER_POLL_INTERVAL_MS: "10",
      }),
    /WORKER_POLL_INTERVAL_MS/,
  );
  assert.throws(
    () =>
      parseConfig({
        ...requiredEnvironment,
        PROCESSING_MAX_ATTEMPTS: "0",
      }),
    /PROCESSING_MAX_ATTEMPTS/,
  );
});
