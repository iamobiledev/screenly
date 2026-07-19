import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { videos } from "@/db/schema";
import {
  apiErrorResponse,
  authenticateUploadRequest,
  unauthorizedResponse,
} from "@/lib/api";
import {
  completeMultipartUpload,
  objectExists,
} from "@/lib/storage";
import { dispatchProcessingJob } from "@/lib/processing";

export const runtime = "nodejs";

const completeUploadSchema = z.object({
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().min(1).max(10_000),
        etag: z.string().trim().min(1).max(256),
      }),
    )
    .min(1)
    .max(10_000)
    .refine(
      (parts) =>
        new Set(parts.map((part) => part.partNumber)).size === parts.length,
      "Part numbers must be unique.",
    ),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ videoId: string }> },
) {
  if (!(await authenticateUploadRequest(request))) {
    return unauthorizedResponse();
  }

  try {
    const { videoId } = await params;
    const input = completeUploadSchema.parse(await request.json());
    const [video] = await getDb()
      .select()
      .from(videos)
      .where(eq(videos.id, videoId))
      .limit(1);

    if (!video) {
      return Response.json(
        {
          error: {
            code: "video_not_found",
            message: "The upload does not exist.",
          },
        },
        { status: 404 },
      );
    }

    if (video.status !== "uploading" || !video.multipartUploadId) {
      if (video.status === "processing") {
        if (!video.processingDispatchedAt) {
          await dispatchAndMarkProcessing(video.id);
        }
        return Response.json({
          videoId: video.id,
          slug: video.slug,
          status: video.status,
        });
      }

      if (video.status === "ready") {
        return Response.json({
          videoId: video.id,
          slug: video.slug,
          status: video.status,
        });
      }

      return Response.json(
        {
          error: {
            code: "upload_not_active",
            message: "The multipart upload is no longer active.",
          },
        },
        { status: 409 },
      );
    }

    const parts = [...input.parts]
      .sort((left, right) => left.partNumber - right.partNumber)
      .map((part) => ({
        PartNumber: part.partNumber,
        ETag: part.etag,
      }));

    try {
      await completeMultipartUpload({
        key: video.sourceObjectKey,
        uploadId: video.multipartUploadId,
        parts,
      });
    } catch (completionError) {
      if (!(await objectExists(video.sourceObjectKey))) {
        throw completionError;
      }
    }

    const now = new Date();
    await getDb()
      .update(videos)
      .set({
        status: "processing",
        multipartUploadId: null,
        uploadedAt: now,
        updatedAt: now,
      })
      .where(eq(videos.id, video.id));

    await dispatchAndMarkProcessing(video.id);

    return Response.json(
      {
        videoId: video.id,
        slug: video.slug,
        status: "processing",
      },
      { status: 202 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

async function dispatchAndMarkProcessing(videoID: string) {
  if (await dispatchProcessingJob(videoID)) {
    await getDb()
      .update(videos)
      .set({
        processingDispatchedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(videos.id, videoID));
  }
}
