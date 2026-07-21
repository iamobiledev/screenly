import { z } from "zod";

import { listVideoViewers } from "@/features/videos/library-service";
import { apiErrorResponse } from "@/lib/api";
import {
  getRequestAuth,
  workspaceUnauthorizedResponse,
} from "@/lib/session";

export const runtime = "nodejs";

const videoIdSchema = z.uuid();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ videoId: string }> },
) {
  const authentication = await getRequestAuth(request);
  if (!authentication) {
    return workspaceUnauthorizedResponse();
  }

  try {
    const { videoId: rawVideoId } = await params;
    const videoId = videoIdSchema.parse(rawVideoId);
    const result = await listVideoViewers(
      authentication.workspace.id,
      videoId,
    );

    if (!result) {
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

    return Response.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
