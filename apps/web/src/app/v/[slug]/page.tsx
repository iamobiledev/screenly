import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { CopyLinkButton } from "@/components/copy-link-button";
import { ProcessingState } from "@/components/processing-state";
import { VideoPlayer } from "@/components/video-player";
import { ViewTracker } from "@/components/view-tracker";
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

  if (!video) {
    return { title: "Video not found" };
  }

  const description = `Watch a recording shared by ${video.recorderName}.`;
  const canonicalUrl = absoluteAppUrl(`/v/${encodeURIComponent(video.slug)}`);
  const metadataThumbnailUrl =
    absoluteAppUrl(
      `/api/videos/${encodeURIComponent(video.slug)}/thumbnail`,
    ) ?? video.thumbnailUrl;
  const metadataPlaybackUrl =
    absoluteAppUrl(
      `/api/videos/${encodeURIComponent(video.slug)}/playback`,
    ) ?? video.playbackUrl;

  return {
    title: video.title,
    description,
    alternates: canonicalUrl ? { canonical: canonicalUrl } : undefined,
    openGraph: {
      type: "website",
      title: video.title,
      description,
      siteName: "Screenly",
      url: canonicalUrl ?? undefined,
      images: metadataThumbnailUrl
        ? [
            {
              url: metadataThumbnailUrl,
              type: "image/jpeg",
              alt: `Preview of ${video.title}`,
            },
          ]
        : undefined,
      videos:
        video.status === "ready" && metadataPlaybackUrl
          ? [
              {
                url: metadataPlaybackUrl,
                type: "video/mp4",
              },
            ]
          : undefined,
    },
    twitter: metadataThumbnailUrl
      ? {
          card: "summary_large_image",
          title: video.title,
          description,
          images: [metadataThumbnailUrl],
        }
      : undefined,
  };
}

export default async function VideoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const video = await getVideo(slug);

  if (!video) {
    notFound();
  }

  return (
    <main className="viewer-shell">
      <header className="viewer-header">
        <Link className="brand" href="/">
          <span className="brand-mark">
            <span />
          </span>
          Screenly
        </Link>
        <CopyLinkButton />
      </header>

      <section className="viewer-content">
        <div className="video-stage">
          {video.status === "ready" && video.playbackUrl ? (
            <VideoPlayer
              posterUrl={video.thumbnailUrl}
              title={video.title}
              videoUrl={video.playbackUrl}
            />
          ) : video.status === "uploading" ||
            video.status === "processing" ? (
            <ProcessingState
              initialProcessing={video.processing}
              slug={video.slug}
              status={video.status}
            />
          ) : (
            <div className="processing-panel processing-panel-error">
              <span className="error-icon">!</span>
              <div>
                <h2>Processing failed</h2>
                <p>The recorder can retry processing from their library.</p>
              </div>
            </div>
          )}
        </div>

        <div className="video-details">
          <div>
            <h1>{video.title}</h1>
            <p>
              Recorded by {video.recorderName} ·{" "}
              {formatRecordedDate(video.createdAt)}
            </p>
          </div>
          <div className="view-count">
            <EyeIcon />
            {video.viewCount.toLocaleString()}{" "}
            {video.viewCount === 1 ? "view" : "views"}
          </div>
        </div>
      </section>
      {video.status === "ready" ? <ViewTracker slug={video.slug} /> : null}
    </main>
  );
}

function formatRecordedDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function absoluteAppUrl(pathname: string) {
  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    return null;
  }

  try {
    return new URL(pathname, appUrl).toString();
  } catch {
    return null;
  }
}

function EyeIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      viewBox="0 0 24 24"
      width="18"
    >
      <path
        d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
