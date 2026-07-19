import { z } from "zod";

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
  const accessToken = await getMetadataAccessToken();
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

async function getMetadataAccessToken() {
  const response = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    {
      headers: {
        "Metadata-Flavor": "Google",
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(
      `Could not obtain a Cloud Run identity token (${response.status}).`,
    );
  }

  const result = (await response.json()) as {
    access_token?: unknown;
  };
  if (typeof result.access_token !== "string") {
    throw new Error("The metadata server returned an invalid access token.");
  }
  return result.access_token;
}
