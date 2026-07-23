import assert from "node:assert/strict";
import test from "node:test";

import { getMacReleaseObjectKey, resolveMacRelease } from "./release";

test("macOS downloads use the latest published object", () => {
  assert.equal(
    getMacReleaseObjectKey(),
    "releases/Screenly-latest.dmg",
  );
});

test("published metadata overrides stale configured release details", () => {
  assert.deepEqual(
    resolveMacRelease({
      downloadURL: "https://screenly.example.com/api/releases/macos/download",
      configuredVersion: "0.2.1",
      configuredSHA256: "old-checksum",
      publishedMetadata: {
        version: "0.2.2",
        sha256: "new-checksum",
      },
    }),
    {
      platform: "macos",
      version: "0.2.2",
      downloadURL:
        "https://screenly.example.com/api/releases/macos/download",
      sha256: "new-checksum",
      minimumSystemVersion: "15.0",
    },
  );
});
