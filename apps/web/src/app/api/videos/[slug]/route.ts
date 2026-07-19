import { apiErrorResponse } from "@/lib/api";
import { getPublicVideoBySlug } from "@/features/videos/video-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const video = await getPublicVideoBySlug(slug);

    if (!video) {
      return Response.json(
        {
          error: {
            code: "video_not_found",
            message: "This video does not exist or has been removed.",
          },
        },
        { status: 404 },
      );
    }

    return Response.json(video, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
