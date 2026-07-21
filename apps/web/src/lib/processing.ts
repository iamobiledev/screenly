import { z } from "zod";

import { getGoogleAccessToken } from "@/lib/gcp-auth";

const cloudRunConfigSchema = z.object({
  GCP_PROCESSOR_JOB: z.string().min(1),
  GCP_PROJECT_ID: z.string().min(1),
  GCP_REGION: z.string().min(1),
});

export async function dispatchProcessingJob(videoID: string) {
  if ((process.env.PROCESSOR_MODE ?? "manual") !== "cloud-run-job") {
    return false;
  }

  const config = cloudRunConfigSchema.parse(process.env);
  const accessToken = await getGoogleAccessToken();
  const jobPath = [
    "projects",
    encodeURIComponent(config.GCP_PROJECT_ID),
    "locations",
    encodeURIComponent(config.GCP_REGION),
    "jobs",
    encodeURIComponent(config.GCP_PROCESSOR_JOB),
  ].join("/");
  const response = await fetch(
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
