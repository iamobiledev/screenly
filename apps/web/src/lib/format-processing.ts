const PROCESSING_STAGE_LABELS: Record<string, string> = {
  queued: "Queued for processing",
  downloading: "Downloading recording",
  inspecting: "Inspecting recording",
  transcoding: "Optimizing playback",
  uploading_playback: "Saving optimized video",
  generating_preview: "Creating video preview",
  uploading_assets: "Saving preview assets",
  packaging_hls: "Preparing smooth playback",
  finalizing: "Finishing up",
};

const STALE_HEARTBEAT_MILLISECONDS = 15_000;

export function processingStageLabel(stage: string | null) {
  return stage ? (PROCESSING_STAGE_LABELS[stage] ?? "Processing video") : "Queued for processing";
}

export function formatProcessingEta(totalSeconds: number) {
  const seconds = Math.max(0, Math.ceil(totalSeconds));

  if (seconds < 10) {
    return "Less than 10 seconds remaining";
  }
  if (seconds < 60) {
    const roundedSeconds = Math.max(10, Math.round(seconds / 5) * 5);
    return `About ${roundedSeconds} seconds remaining`;
  }

  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  if (totalMinutes < 60) {
    return `About ${totalMinutes} ${totalMinutes === 1 ? "minute" : "minutes"} remaining`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hourLabel = `${hours} ${hours === 1 ? "hour" : "hours"}`;
  const minuteLabel =
    minutes > 0 ? ` ${minutes} ${minutes === 1 ? "minute" : "minutes"}` : "";
  return `About ${hourLabel}${minuteLabel} remaining`;
}

export function isProcessingHeartbeatStale(
  heartbeatAt: string | null,
  now = Date.now(),
) {
  if (!heartbeatAt) {
    return false;
  }

  const heartbeatTime = Date.parse(heartbeatAt);
  return (
    Number.isFinite(heartbeatTime) &&
    now - heartbeatTime > STALE_HEARTBEAT_MILLISECONDS
  );
}
