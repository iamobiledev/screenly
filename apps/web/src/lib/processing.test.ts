import assert from "node:assert/strict";
import test from "node:test";

import {
  dispatchProcessingJob,
  getProcessorMode,
} from "./processing";

const videoID = "6998b3eb-6a0c-4f87-a28d-ae96ea45162b";

test("processor mode defaults to manual and validates configured modes", () => {
  assert.equal(getProcessorMode({}), "manual");
  assert.equal(
    getProcessorMode({ PROCESSOR_MODE: "worker-pool" }),
    "worker-pool",
  );
  assert.equal(
    getProcessorMode({ PROCESSOR_MODE: "cloud-run-job" }),
    "cloud-run-job",
  );
  assert.throws(
    () => getProcessorMode({ PROCESSOR_MODE: "unknown" }),
    /Invalid option/,
  );
});

test("worker-pool mode queues without calling Google APIs", async () => {
  let fetched = false;
  let requestedToken = false;

  const queued = await dispatchProcessingJob(videoID, {
    environment: { PROCESSOR_MODE: "worker-pool" },
    fetch: async () => {
      fetched = true;
      return new Response();
    },
    getAccessToken: async () => {
      requestedToken = true;
      return "unused";
    },
  });

  assert.equal(queued, true);
  assert.equal(fetched, false);
  assert.equal(requestedToken, false);
});

test("manual mode leaves processing for local invocation", async () => {
  const dispatched = await dispatchProcessingJob(videoID, {
    environment: { PROCESSOR_MODE: "manual" },
  });

  assert.equal(dispatched, false);
});

test("cloud-run-job mode dispatches the requested video", async () => {
  let request: Request | undefined;
  const dispatched = await dispatchProcessingJob(videoID, {
    environment: {
      PROCESSOR_MODE: "cloud-run-job",
      GCP_PROCESSOR_JOB: "screenly-processor",
      GCP_PROJECT_ID: "screenly-project",
      GCP_REGION: "us-central1",
    },
    getAccessToken: async () => "access-token",
    fetch: async (input, init) => {
      request = new Request(input, init);
      return Response.json({}, { status: 200 });
    },
  });

  assert.equal(dispatched, true);
  assert.ok(request);
  assert.equal(
    request.url,
    "https://run.googleapis.com/v2/projects/screenly-project/locations/us-central1/jobs/screenly-processor:run",
  );
  assert.equal(request.headers.get("authorization"), "Bearer access-token");
  assert.deepEqual(await request.json(), {
    overrides: {
      taskCount: 1,
      timeout: "3600s",
      containerOverrides: [
        {
          env: [{ name: "VIDEO_ID", value: videoID }],
        },
      ],
    },
  });
});
