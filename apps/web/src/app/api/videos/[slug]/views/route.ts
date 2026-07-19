import { eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { videos } from "@/db/schema";
import { apiErrorResponse } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;

    if (slug === "demo1234") {
      return Response.json({ viewCount: 1 });
    }

    const [video] = await getDb()
      .update(videos)
      .set({
        viewCount: sql`${videos.viewCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(videos.slug, slug))
      .returning({ viewCount: videos.viewCount });

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

    return Response.json(video);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
