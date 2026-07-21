import assert from "node:assert/strict";
import test from "node:test";

import {
  createStagePlan,
  ProcessingProgressReporter,
  TransferRateEstimator,
  type ProgressUpdate,
} from "./progress.js";

test("transfer estimator uses measured smoothed throughput", () => {
  const estimator = new TransferRateEstimator(0);

  assert.equal(estimator.sample(0, 2_000, 0).etaSeconds, null);
  const halfway = estimator.sample(1_000, 2_000, 1_000);
  assert.equal(halfway.fraction, 0.5);
  assert.equal(halfway.bytesPerSecond, 1_000);
  assert.equal(halfway.etaSeconds, 1);

  const complete = estimator.sample(2_000, 2_000, 2_000);
  assert.equal(complete.fraction, 1);
  assert.equal(complete.etaSeconds, 0);
});

test("stage plan includes only work selected by the probe", () => {
  assert.deepEqual(
    createStagePlan({
      durationSeconds: 120,
      sizeBytes: 50 * 1_024 * 1_024,
      needsTranscode: false,
      needsHls: false,
    }).map((entry) => entry.stage),
    ["generating_preview", "uploading_assets", "finalizing"],
  );

  assert.deepEqual(
    createStagePlan({
      durationSeconds: 1_500,
      sizeBytes: 500 * 1_024 * 1_024,
      needsTranscode: true,
      needsHls: true,
    }).map((entry) => entry.stage),
    [
      "transcoding",
      "uploading_playback",
      "generating_preview",
      "uploading_assets",
      "packaging_hls",
      "finalizing",
    ],
  );
});

test("reported progress stays monotonic while ETA includes future stages", async () => {
  const updates: ProgressUpdate[] = [];
  let now = 1_000;
  const reporter = new ProcessingProgressReporter(
    async (update) => {
      updates.push(update);
    },
    () => now,
  );

  await reporter.beginStage("downloading");
  now += 1_000;
  reporter.report(0.5, null);
  await reporter.flush();
  await reporter.completeStage();

  await reporter.beginStage("inspecting");
  reporter.configurePlan([
    { stage: "transcoding", estimatedSeconds: 20 },
    { stage: "generating_preview", estimatedSeconds: 5 },
    { stage: "uploading_assets", estimatedSeconds: 2 },
    { stage: "finalizing", estimatedSeconds: 1 },
  ]);
  await reporter.completeStage();

  await reporter.beginStage("transcoding");
  now += 1_000;
  reporter.report(0.5, 10, true);
  await reporter.flush();

  const active = updates.at(-1);
  assert.ok(active);
  assert.equal(active.stage, "transcoding");
  assert.equal(active.etaSeconds, 18);

  await reporter.completeStage();
  await reporter.beginStage("generating_preview");
  now += 1_000;
  reporter.report(0.2, 4, true);
  await reporter.flush();

  for (let index = 1; index < updates.length; index += 1) {
    assert.ok(
      updates[index]!.progressBasisPoints >=
        updates[index - 1]!.progressBasisPoints,
    );
    assert.ok(updates[index]!.progressBasisPoints <= 9_900);
  }
});
