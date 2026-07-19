import { randomBytes, randomUUID } from "node:crypto";

import { z } from "zod";

import { getDb } from "@/db";
import { videos } from "@/db/schema";
import {
  apiErrorResponse,
  isUploadAuthorized,
  unauthorizedResponse,
} from "@/lib/api";
import {
  abortMultipartUpload,
  createMultipartUpload,
} from "@/lib/storage";

export const runtime = "nodejs";

const MEBIBYTE = 1024 * 1024;
const MINIMUM_PART_SIZE = 10 * MEBIBYTE;
const MAXIMUM_PARTS = 10_000;

const initiateUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z
    .string()
    .trim()
    .refine(
      (value) =>
        value.startsWith("video/") || value === "application/octet-stream",
      "Only video uploads are supported.",
    ),
  sizeBytes: z.number().int().positive().max(100 * 1024 * 1024 * 1024),
  title: z.string().trim().min(1).max(240).optional(),
  recorderName: z.string().trim().min(1).max(120).optional(),
});

export async function POST(request: Request) {
  if (!isUploadAuthorized(request)) {
    return unauthorizedResponse();
  }

  let objectKey: string | undefined;
  let multipartUploadId: string | undefined;

  try {
    const input = initiateUploadSchema.parse(await request.json());
    const videoId = randomUUID();
    const slug = randomBytes(9).toString("base64url");
    const title = input.title ?? titleFromFileName(input.fileName);
    const extension = safeExtension(input.fileName);
    objectKey = `source/${videoId}/recording${extension}`;
    const partSizeBytes = calculatePartSize(input.sizeBytes);

    multipartUploadId = await createMultipartUpload({
      key: objectKey,
      contentType: input.contentType,
      title,
    });

    await getDb().insert(videos).values({
      id: videoId,
      slug,
      title,
      recorderName: input.recorderName,
      sourceObjectKey: objectKey,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      multipartUploadId,
    });

    const appUrl = (process.env.APP_URL ?? new URL(request.url).origin).replace(
      /\/$/,
      "",
    );

    return Response.json(
      {
        videoId,
        slug,
        shareUrl: `${appUrl}/v/${slug}`,
        uploadId: multipartUploadId,
        partSizeBytes,
        partCount: Math.ceil(input.sizeBytes / partSizeBytes),
      },
      { status: 201 },
    );
  } catch (error) {
    if (objectKey && multipartUploadId) {
      await abortMultipartUpload({
        key: objectKey,
        uploadId: multipartUploadId,
      }).catch((abortError) => {
        console.error("Failed to clean up multipart upload", abortError);
      });
    }

    return apiErrorResponse(error);
  }
}

function calculatePartSize(sizeBytes: number) {
  const requiredPartSize = Math.ceil(sizeBytes / MAXIMUM_PARTS);
  return Math.max(
    MINIMUM_PART_SIZE,
    Math.ceil(requiredPartSize / MEBIBYTE) * MEBIBYTE,
  );
}

function titleFromFileName(fileName: string) {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  return withoutExtension || "Untitled recording";
}

function safeExtension(fileName: string) {
  const match = fileName.toLowerCase().match(/\.(mp4|mov|m4v)$/);
  return match?.[0] ?? ".mp4";
}
