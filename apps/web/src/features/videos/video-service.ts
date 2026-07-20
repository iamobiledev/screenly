import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { videos, type Video } from "@/db/schema";
import { getPlaybackUrl } from "@/lib/storage";

export type PublicVideo = {
  slug: string;
  title: string;
  recorderName: string;
  status: "uploading" | "processing" | "ready" | "failed";
  playbackUrl: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  viewCount: number;
  createdAt: string;
  readyAt: string | null;
  processing: PublicProcessingState | null;
};

export type PublicProcessingState = {
  stage: string | null;
  progressPercent: number | null;
  etaSeconds: number | null;
  heartbeatAt: string | null;
};

const demoVideo: PublicVideo = {
  slug: "demo1234",
  title: "Welcome to Screenly",
  recorderName: "Screenly team",
  status: "ready",
  playbackUrl:
    "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  thumbnailUrl: null,
  durationSeconds: 15,
  viewCount: 1,
  createdAt: "2026-07-19T00:00:00.000Z",
  readyAt: "2026-07-19T00:00:00.000Z",
  processing: null,
};

export async function getPublicVideoBySlug(slug: string) {
  if (slug === demoVideo.slug) {
    return demoVideo;
  }

  const [video] = await getDb()
    .select()
    .from(videos)
    .where(eq(videos.slug, slug))
    .limit(1);

  return video ? toPublicVideo(video) : null;
}

async function toPublicVideo(video: Video): Promise<PublicVideo> {
  const playbackKey =
    video.status === "ready"
      ? (video.playbackObjectKey ?? video.sourceObjectKey)
      : null;

  const [playbackUrl, thumbnailUrl] = await Promise.all([
    playbackKey ? getPlaybackUrl(playbackKey) : null,
    video.thumbnailObjectKey
      ? getPlaybackUrl(video.thumbnailObjectKey)
      : null,
  ]);

  return {
    slug: video.slug,
    title: video.title,
    recorderName: video.recorderName,
    status: video.status,
    playbackUrl,
    thumbnailUrl,
    durationSeconds: video.durationSeconds,
    viewCount: video.viewCount,
    createdAt: video.createdAt.toISOString(),
    readyAt: video.readyAt?.toISOString() ?? null,
    processing:
      video.status === "processing"
        ? {
            stage: video.processingStage,
            progressPercent:
              video.processingProgress === null
                ? null
                : Math.round(
                    Math.min(10_000, Math.max(0, video.processingProgress)) /
                      100,
                  ),
            etaSeconds:
              video.processingEtaSeconds === null
                ? null
                : Math.max(0, video.processingEtaSeconds),
            heartbeatAt:
              video.processingHeartbeatAt?.toISOString() ?? null,
          }
        : null,
  };
}
