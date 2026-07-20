import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { videos } from "@/db/schema";
import {
  apiErrorResponse,
  authenticateUploadRequest,
  unauthorizedResponse,
} from "@/lib/api";
import { abortMultipartUpload } from "@/lib/storage";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ videoId: string }> },
) {
  const authentication = await authenticateUploadRequest(request);
  if (!authentication) {
    return unauthorizedResponse();
  }

  try {
    const { videoId } = await params;
    const [video] = await getDb()
      .select()
      .from(videos)
      .where(
        and(
          eq(videos.id, videoId),
          eq(videos.workspaceId, authentication.workspaceId),
        ),
      )
      .limit(1);

    if (!video) {
      return new Response(null, { status: 204 });
    }

    if (video.status !== "uploading" || !video.multipartUploadId) {
      return Response.json(
        {
          error: {
            code: "upload_not_active",
            message: "Only active uploads can be discarded here.",
          },
        },
        { status: 409 },
      );
    }

    await abortMultipartUpload({
      key: video.sourceObjectKey,
      uploadId: video.multipartUploadId,
    });
    await getDb()
      .delete(videos)
      .where(
        and(
          eq(videos.id, video.id),
          eq(videos.workspaceId, authentication.workspaceId),
        ),
      );

    return new Response(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
