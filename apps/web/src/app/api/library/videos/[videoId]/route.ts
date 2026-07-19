import { z } from "zod";

import {
  deleteVideo,
  renameVideo,
} from "@/features/videos/library-service";
import { apiErrorResponse } from "@/lib/api";
import {
  isRequestAuthenticated,
  workspaceUnauthorizedResponse,
} from "@/lib/session";

export const runtime = "nodejs";

const videoIdSchema = z.uuid();
const renameSchema = z.object({
  title: z.string().trim().min(1).max(240),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ videoId: string }> },
) {
  if (!isRequestAuthenticated(request)) {
    return workspaceUnauthorizedResponse();
  }

  try {
    const { videoId: rawVideoId } = await params;
    const videoId = videoIdSchema.parse(rawVideoId);
    const { title } = renameSchema.parse(await request.json());
    const video = await renameVideo(videoId, title);

    if (!video) {
      return notFoundResponse();
    }

    return Response.json(video);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ videoId: string }> },
) {
  if (!isRequestAuthenticated(request)) {
    return workspaceUnauthorizedResponse();
  }

  try {
    const { videoId: rawVideoId } = await params;
    const videoId = videoIdSchema.parse(rawVideoId);
    const deleted = await deleteVideo(videoId);

    return deleted ? new Response(null, { status: 204 }) : notFoundResponse();
  } catch (error) {
    return apiErrorResponse(error);
  }
}

function notFoundResponse() {
  return Response.json(
    {
      error: {
        code: "video_not_found",
        message: "The video does not exist.",
      },
    },
    { status: 404 },
  );
}
