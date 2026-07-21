import { eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { videos, videoViews } from "@/db/schema";
import { apiErrorResponse } from "@/lib/api";
import { getRequestAuth } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(
  request: Request,
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
      .returning({ id: videos.id, viewCount: videos.viewCount });

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

    const authentication = await getRequestAuth(request);
    if (authentication) {
      const now = new Date();
      await getDb()
        .insert(videoViews)
        .values({
          videoId: video.id,
          viewerUserId: authentication.user.id,
          viewerName: authentication.user.username,
          firstViewedAt: now,
          lastViewedAt: now,
        })
        .onConflictDoUpdate({
          target: [videoViews.videoId, videoViews.viewerUserId],
          set: {
            viewerName: authentication.user.username,
            watchCount: sql`${videoViews.watchCount} + 1`,
            lastViewedAt: now,
          },
        });
    }

    return Response.json({ viewCount: video.viewCount });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
