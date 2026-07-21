import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { getPublicVideoBySlug } from "@/features/videos/video-service";

export const dynamic = "force-dynamic";

const getVideo = cache(getPublicVideoBySlug);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const video = await getVideo(slug);

  return {
    title: video?.title ?? "Video",
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function EmbeddedVideoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const video = await getVideo(slug);

  if (!video || video.status !== "ready" || !video.playbackUrl) {
    notFound();
  }

  return (
    <main className="embed-player">
      <video
        aria-label={video.title}
        controls
        playsInline
        poster={video.thumbnailUrl ?? undefined}
        preload="metadata"
        src={video.playbackUrl}
      />
    </main>
  );
}
