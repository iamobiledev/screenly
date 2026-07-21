import assert from "node:assert/strict";
import test from "node:test";

import {
  formatProcessingEta,
  isProcessingHeartbeatStale,
  processingStageLabel,
} from "./format-processing";

test("processing phases and ETA are formatted for people", () => {
  assert.equal(processingStageLabel("transcoding"), "Optimizing playback");
  assert.equal(processingStageLabel("new_stage"), "Processing video");
  assert.equal(formatProcessingEta(4), "Less than 10 seconds remaining");
  assert.equal(formatProcessingEta(43), "About 45 seconds remaining");
  assert.equal(formatProcessingEta(61), "About 1 minute remaining");
  assert.equal(formatProcessingEta(3_900), "About 1 hour 5 minutes remaining");
});

test("heartbeat becomes stale only after the processing threshold", () => {
  const heartbeat = "2026-07-20T12:00:00.000Z";
  const heartbeatTime = Date.parse(heartbeat);

  assert.equal(isProcessingHeartbeatStale(null, heartbeatTime + 60_000), false);
  assert.equal(
    isProcessingHeartbeatStale(heartbeat, heartbeatTime + 10_000),
    false,
  );
  assert.equal(
    isProcessingHeartbeatStale(heartbeat, heartbeatTime + 16_000),
    true,
  );
});
