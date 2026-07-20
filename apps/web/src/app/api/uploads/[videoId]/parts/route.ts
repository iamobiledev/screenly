import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { videos } from "@/db/schema";
import {
  apiErrorResponse,
  authenticateUploadRequest,
  unauthorizedResponse,
} from "@/lib/api";
import { signUploadParts } from "@/lib/storage";

export const runtime = "nodejs";

const signPartsSchema = z.object({
  partNumbers: z
    .array(z.number().int().min(1).max(10_000))
    .min(1)
    .max(100)
    .refine(
      (partNumbers) => new Set(partNumbers).size === partNumbers.length,
      "Part numbers must be unique.",
    ),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ videoId: string }> },
) {
  const authentication = await authenticateUploadRequest(request);
  if (!authentication) {
    return unauthorizedResponse();
  }

  try {
    const { videoId } = await params;
    const input = signPartsSchema.parse(await request.json());
    const [video] = await getDb()
      .select({
        status: videos.status,
        sourceObjectKey: videos.sourceObjectKey,
        multipartUploadId: videos.multipartUploadId,
      })
      .from(videos)
      .where(
        and(
          eq(videos.id, videoId),
          eq(videos.workspaceId, authentication.workspaceId),
        ),
      )
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

    const parts = await signUploadParts({
      key: video.sourceObjectKey,
      uploadId: video.multipartUploadId,
      partNumbers: input.partNumbers,
    });

    return Response.json({ parts });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
