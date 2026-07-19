import { z } from "zod";

const configSchema = z.object({
  DATABASE_URL: z.url(),
  VIDEO_ID: z.uuid(),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ENDPOINT: z.url().optional(),
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  S3_REGION: z.string().min(1).default("auto"),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  HLS_THRESHOLD_SECONDS: z.coerce.number().int().positive().default(1_200),
  PROCESSING_TEMP_DIR: z.string().min(1).default("/tmp/screenly"),
});

export type WorkerConfig = z.infer<typeof configSchema>;

export function getConfig() {
  return configSchema.parse(process.env);
}
