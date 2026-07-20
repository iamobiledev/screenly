import { z } from "zod";

const configSchema = z.object({
  CLOUD_SQL_INSTANCE: z.string().min(1).optional(),
  DATABASE_URL: z.url(),
  VIDEO_ID: z.uuid(),
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
  HLS_THRESHOLD_SECONDS: z.coerce.number().int().positive().default(1_200),
  PROCESSING_TEMP_DIR: z.string().min(1).default("/tmp/screenly"),
});

export type WorkerConfig = z.infer<typeof configSchema>;

export function getConfig() {
  return configSchema.parse(process.env);
}
