import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.url(),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ENDPOINT: z.url().optional(),
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  S3_PUBLIC_BASE_URL: z.url().optional(),
  S3_REGION: z.string().min(1).default("auto"),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  UPLOAD_API_TOKEN: z.string().min(32).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (!cachedEnv) {
    cachedEnv = serverEnvSchema.parse(process.env);
  }

  return cachedEnv;
}
