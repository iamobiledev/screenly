"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { PublicProcessingState } from "@/features/videos/video-service";
import {
  formatProcessingEta,
  isProcessingHeartbeatStale,
  processingStageLabel,
} from "@/lib/format-processing";

type ProcessingStateProps = {
  slug: string;
  status: "uploading" | "processing";
  initialProcessing: PublicProcessingState | null;
};

type VideoStatusResponse = {
  status: "uploading" | "processing" | "ready" | "failed";
  processing: PublicProcessingState | null;
};

export function ProcessingState({
  slug,
  status,
  initialProcessing,
}: ProcessingStateProps) {
  const router = useRouter();
  const [currentStatus, setCurrentStatus] = useState(status);
  const [processing, setProcessing] = useState(initialProcessing);
  const [clock, setClock] = useState(0);
  const [etaUpdatedAt, setEtaUpdatedAt] = useState(0);

  useEffect(() => {
    const tick = window.setInterval(() => setClock(Date.now()), 1_000);

    const poll = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/videos/${encodeURIComponent(slug)}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const video = (await response.json()) as VideoStatusResponse;
        if (video.status === "ready" || video.status === "failed") {
          window.clearInterval(poll);
          router.refresh();
          return;
        }

        setCurrentStatus(video.status);
        setProcessing(video.processing);
        const receivedAt = Date.now();
        setClock(receivedAt);
        setEtaUpdatedAt(receivedAt);
      } catch {
        // A temporary network failure should not interrupt future polls.
      }
    }, 2_000);

    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [router, slug]);

  if (currentStatus === "uploading") {
    return (
      <div className="processing-panel" role="status">
        <span className="processing-spinner" />
        <div>
          <h2>Uploading recording</h2>
          <p>
            The recording is still being uploaded. This page will update
            automatically.
          </p>
        </div>
      </div>
    );
  }

  const progressPercent = processing?.progressPercent;
  const stage = processing?.stage ?? null;
  const heartbeatIsStale =
    clock > 0 &&
    isProcessingHeartbeatStale(processing?.heartbeatAt ?? null, clock);
  const elapsedSinceEtaUpdate =
    clock > 0 && etaUpdatedAt > 0 ? (clock - etaUpdatedAt) / 1_000 : 0;
  const remainingSeconds =
    processing?.etaSeconds === null || processing?.etaSeconds === undefined
      ? null
      : Math.max(0, processing.etaSeconds - elapsedSinceEtaUpdate);
  const detail = heartbeatIsStale
    ? "Processor update delayed. We’ll keep checking automatically."
    : stage === null || stage === "queued"
      ? "Your recording is uploaded and waiting for the processor to start."
      : remainingSeconds === null
        ? "Measuring processing speed to estimate the remaining time."
        : formatProcessingEta(remainingSeconds);

  return (
    <div className="processing-panel processing-panel-progress">
      <div className="processing-progress-copy">
        <div className="processing-progress-heading">
          <h2>{processingStageLabel(stage)}</h2>
          <strong>{progressPercent ?? 0}%</strong>
        </div>
        <div
          aria-label="Video processing progress"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progressPercent ?? undefined}
          className={`processing-progress-track${progressPercent == null ? " is-indeterminate" : ""}`}
          role="progressbar"
        >
          <span style={{ width: `${progressPercent ?? 0}%` }} />
        </div>
        <p aria-live="off">{detail}</p>
        <span className="processing-progress-note">
          Playback starts automatically when processing finishes.
        </span>
      </div>
    </div>
  );
}
