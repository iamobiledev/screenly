import assert from "node:assert/strict";
import test from "node:test";

import { parseFfmpegProgress } from "./media.js";

test("ffmpeg progress uses output media time and processing speed", () => {
  const progress = parseFfmpegProgress(
    {
      out_time_us: "5000000",
      speed: "2.0x",
      progress: "continue",
    },
    10,
  );

  assert.deepEqual(progress, {
    fraction: 0.5,
    speed: 2,
    etaSeconds: 2.5,
  });
});

test("ffmpeg progress supports timestamp fallback and terminal records", () => {
  const progress = parseFfmpegProgress(
    {
      out_time: "00:00:03.500000",
      speed: "0.5x",
      progress: "end",
    },
    8,
  );

  assert.deepEqual(progress, {
    fraction: 1,
    speed: 0.5,
    etaSeconds: 0,
  });
  assert.equal(parseFfmpegProgress({}, 8), null);
});
