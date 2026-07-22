import { z } from "zod";

import { getGoogleAccessToken } from "./gcp-auth";

const cloudRunConfigSchema = z.object({
  GCP_PROCESSOR_JOB: z.string().min(1),
  GCP_PROJECT_ID: z.string().min(1),
  GCP_REGION: z.string().min(1),
});

const processorModeSchema = z
  .enum(["manual", "cloud-run-job", "worker-pool"])
  .default("manual");

type DispatchOptions = {
  environment?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  getAccessToken?: () => Promise<string>;
};

export function getProcessorMode(
  environment: Record<string, string | undefined>,
) {
  return processorModeSchema.parse(environment.PROCESSOR_MODE);
}

export async function dispatchProcessingJob(
  videoID: string,
  options: DispatchOptions = {},
) {
  const environment = options.environment ?? process.env;
  const mode = getProcessorMode(environment);
  if (mode === "worker-pool") {
    // Changing the video row to `processing` enqueues it for the warm worker.
    return true;
  }
  if (mode === "manual") {
    return false;
  }

  const config = cloudRunConfigSchema.parse(environment);
  const accessToken = await (
    options.getAccessToken ?? getGoogleAccessToken
  )();
  const jobPath = [
    "projects",
    encodeURIComponent(config.GCP_PROJECT_ID),
    "locations",
    encodeURIComponent(config.GCP_REGION),
    "jobs",
    encodeURIComponent(config.GCP_PROCESSOR_JOB),
  ].join("/");
  const response = await (options.fetch ?? fetch)(
    `https://run.googleapis.com/v2/${jobPath}:run`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        overrides: {
          taskCount: 1,
          timeout: "3600s",
          containerOverrides: [
            {
              env: [{ name: "VIDEO_ID", value: videoID }],
            },
          ],
        },
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(
      `Cloud Run Job dispatch failed (${response.status}): ${await response.text()}`,
    );
  }

  return true;
}
