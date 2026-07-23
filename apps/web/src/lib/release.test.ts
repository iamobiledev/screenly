import assert from "node:assert/strict";
import test from "node:test";

import { getMacReleaseObjectKey } from "./release";

test("macOS releases use the versioned published object", () => {
  assert.equal(
    getMacReleaseObjectKey("0.2.1"),
    "releases/Screenly-0.2.1.dmg",
  );
});
