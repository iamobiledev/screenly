"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type ProcessingStateProps = {
  slug: string;
  status: "uploading" | "processing";
};

export function ProcessingState({ slug, status }: ProcessingStateProps) {
  const router = useRouter();

  useEffect(() => {
    const poll = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/videos/${encodeURIComponent(slug)}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const video = (await response.json()) as { status: string };
        if (video.status === "ready" || video.status === "failed") {
          window.clearInterval(poll);
          router.refresh();
        }
      } catch {
        // A temporary network failure should not interrupt future polls.
      }
    }, 3_000);

    return () => window.clearInterval(poll);
  }, [router, slug]);

  return (
    <div className="processing-panel" role="status">
      <span className="processing-spinner" />
      <div>
        <h2>{status === "uploading" ? "Uploading recording" : "Processing video"}</h2>
        <p>
          {status === "uploading"
            ? "The recording is still being uploaded. This page will update automatically."
            : "The recording is safely uploaded. Playback will begin as soon as processing finishes."}
        </p>
      </div>
    </div>
  );
}
