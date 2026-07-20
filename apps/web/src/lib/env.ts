import { z } from "zod";

const serverEnvSchema = z.object({
  APP_URL: z.url().optional(),
  DATABASE_URL: z.url(),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(32),
  STORAGE_ACCESS_KEY_ID: z.string().min(1),
  STORAGE_BACKEND: z.enum(["gcs", "s3"]).default("s3"),
  STORAGE_BUCKET: z.string().min(1),
  STORAGE_ENDPOINT: z.url().optional(),
  STORAGE_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  STORAGE_PUBLIC_BASE_URL: z.url().optional(),
  STORAGE_REGION: z.string().min(1).default("auto"),
  STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
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
