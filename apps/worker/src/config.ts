import { z } from "zod";

const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const optionalVideoID = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.uuid().optional(),
);

const configSchema = z.object({
  APP_URL: z.url().optional(),
  CLOUD_SQL_INSTANCE: z.string().min(1).optional(),
  DATABASE_URL: z.url(),
  VIDEO_ID: optionalVideoID,
  STORAGE_ACCESS_KEY_ID: z.string().min(1),
  STORAGE_BACKEND: z.enum(["gcs", "s3"]).default("s3"),
  STORAGE_BUCKET: z.string().min(1),
  STORAGE_ENDPOINT: z.url().optional(),
  STORAGE_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  STORAGE_REGION: z.string().min(1).default("auto"),
  STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
  SLACK_BOT_TOKEN: optionalSecret,
  HLS_THRESHOLD_SECONDS: z.coerce.number().int().positive().default(1_200),
  PROCESSING_TEMP_DIR: z.string().min(1).default("/tmp/screenly"),
  PROCESSING_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(4),
  WORKER_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(60_000)
    .default(1_000),
});

export type WorkerConfig = z.infer<typeof configSchema>;

export function parseConfig(environment: NodeJS.ProcessEnv) {
  return configSchema.parse(environment);
}

export function getConfig() {
  return parseConfig(process.env);
}
