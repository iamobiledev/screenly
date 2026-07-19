import { desc, eq, ilike } from "drizzle-orm";

import { getDb } from "@/db";
import { videos } from "@/db/schema";
import {
  deleteObjectPrefix,
  deleteObjects,
  getPlaybackUrl,
} from "@/lib/storage";

const LIBRARY_PAGE_SIZE = 50;

export async function listLibraryVideos(query?: string) {
  const normalizedQuery = query?.trim();
  const rows = await getDb()
    .select({
      id: videos.id,
      slug: videos.slug,
      title: videos.title,
      recorderName: videos.recorderName,
      status: videos.status,
      thumbnailObjectKey: videos.thumbnailObjectKey,
      durationSeconds: videos.durationSeconds,
      viewCount: videos.viewCount,
      createdAt: videos.createdAt,
    })
    .from(videos)
    .where(
      normalizedQuery
        ? ilike(videos.title, `%${normalizedQuery.replaceAll("%", "\\%")}%`)
        : undefined,
    )
    .orderBy(desc(videos.createdAt))
    .limit(LIBRARY_PAGE_SIZE);

  return Promise.all(
    rows.map(async (video) => ({
      ...video,
      createdAt: video.createdAt.toISOString(),
      thumbnailUrl: video.thumbnailObjectKey
        ? await getPlaybackUrl(video.thumbnailObjectKey)
        : null,
      thumbnailObjectKey: undefined,
    })),
  );
}

export async function renameVideo(videoId: string, title: string) {
  const [video] = await getDb()
    .update(videos)
    .set({
      title,
      updatedAt: new Date(),
    })
    .where(eq(videos.id, videoId))
    .returning({
      id: videos.id,
      title: videos.title,
    });

  return video ?? null;
}

export async function deleteVideo(videoId: string) {
  const [video] = await getDb()
    .select()
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1);

  if (!video) {
    return false;
  }

  await Promise.all([
    deleteObjects([video.sourceObjectKey]),
    deleteObjectPrefix(`processed/${video.id}/`),
  ]);
  await getDb().delete(videos).where(eq(videos.id, video.id));
  return true;
}
