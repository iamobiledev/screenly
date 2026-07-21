import { randomUUID } from "node:crypto";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";

import { getConfig } from "./config.js";
import { VideoRepository } from "./database.js";
import {
  generateAnimatedPreview,
  generateHLS,
  generateThumbnail,
  probeMedia,
  transcodeToMP4,
} from "./media.js";
import {
  createStagePlan,
  ProcessingProgressReporter,
  TransferRateEstimator,
} from "./progress.js";
import { SlackNotifier } from "./slack.js";
import { ObjectStorage } from "./storage.js";

async function main() {
  const config = getConfig();
  const repository = new VideoRepository(config);
  const storage = new ObjectStorage(config);
  const slackNotifier =
    config.APP_URL && config.SLACK_BOT_TOKEN
      ? new SlackNotifier(
          repository,
          config.APP_URL,
          config.SLACK_BOT_TOKEN,
        )
      : null;
  const leaseID = randomUUID();
  try {
    let video = await repository.claim(config.VIDEO_ID, leaseID);

    for (let attempt = 0; !video && attempt < 7; attempt += 1) {
      if ((await repository.getVideoStatus(config.VIDEO_ID)) !== "processing") {
        break;
      }
      await sleep(5_000);
      video = await repository.claim(config.VIDEO_ID, leaseID);
    }

    if (!video) {
      await slackNotifier?.refreshVideo(config.VIDEO_ID);
      console.log(
        JSON.stringify({
          level: "info",
          message: "Video is already being processed or no longer needs work.",
          videoID: config.VIDEO_ID,
        }),
      );
      return;
    }

    const progress = new ProcessingProgressReporter((update) =>
      repository.updateProgress({
        videoID: video.id,
        leaseID,
        ...update,
      }),
    );
    const workDirectory = path.join(
      config.PROCESSING_TEMP_DIR,
      `${video.id}-${leaseID}`,
    );
    const sourceExtension = path.extname(video.sourceObjectKey) || ".mp4";
    const sourcePath = path.join(workDirectory, `source${sourceExtension}`);
    const playbackPath = path.join(workDirectory, "playback.mp4");
    const thumbnailPath = path.join(workDirectory, "thumbnail.jpg");
    const previewPath = path.join(workDirectory, "preview.webp");
    const hlsDirectory = path.join(workDirectory, "hls");
    const objectPrefix = `processed/${video.id}`;
    let processingCompleted = false;

    try {
      await mkdir(workDirectory, { recursive: true });
      await progress.beginStage("downloading");
      console.log(
        JSON.stringify({
          level: "info",
          message: "Downloading source recording.",
          videoID: video.id,
        }),
      );
      const downloadRate = new TransferRateEstimator();
      await storage.download(
        video.sourceObjectKey,
        sourcePath,
        (transferredBytes, totalBytes) => {
          const measurement = downloadRate.sample(
            transferredBytes,
            totalBytes || video.sizeBytes,
          );
          // The media duration is not known yet, so a download-only ETA would
          // understate the full processing time.
          progress.report(measurement.fraction, null);
        },
        progress.abortSignal,
      );
      await progress.completeStage();

      await progress.beginStage("inspecting");
      const sourceProbe = await probeMedia(sourcePath);
      await repository.setDuration(
        video.id,
        leaseID,
        sourceProbe.durationSeconds,
      );
      progress.configurePlan(
        createStagePlan({
          durationSeconds: sourceProbe.durationSeconds,
          sizeBytes: video.sizeBytes,
          needsTranscode: !sourceProbe.isWebCompatible,
          needsHls:
            sourceProbe.durationSeconds >= config.HLS_THRESHOLD_SECONDS,
        }),
      );
      progress.report(1, null, true);
      await progress.completeStage();
      let finalPlaybackPath = sourcePath;
      let playbackObjectKey = video.sourceObjectKey;

      if (!sourceProbe.isWebCompatible) {
        await progress.beginStage("transcoding");
        console.log(
          JSON.stringify({
            level: "info",
            message: "Transcoding recording for browser playback.",
            videoID: video.id,
            audioTracks: sourceProbe.audio.length,
          }),
        );
        await transcodeToMP4(
          sourcePath,
          playbackPath,
          sourceProbe,
          (measurement) => {
            progress.report(
              measurement.fraction,
              measurement.etaSeconds,
            );
          },
        );
        await progress.completeStage();
        finalPlaybackPath = playbackPath;
        playbackObjectKey = `${objectPrefix}/video.mp4`;
        await progress.beginStage("uploading_playback");
        const playbackUploadRate = new TransferRateEstimator();
        await storage.uploadFile(
          playbackPath,
          playbackObjectKey,
          (transferredBytes, totalBytes) => {
            const measurement = playbackUploadRate.sample(
              transferredBytes,
              totalBytes,
            );
            progress.report(
              measurement.fraction,
              measurement.etaSeconds,
            );
          },
          progress.abortSignal,
        );
        await progress.completeStage();
      }

      const playbackProbe =
        finalPlaybackPath === sourcePath
          ? sourceProbe
          : await probeMedia(finalPlaybackPath);
      await progress.beginStage("generating_preview");
      await Promise.all([
        generateThumbnail(
          finalPlaybackPath,
          thumbnailPath,
          playbackProbe.durationSeconds,
        ),
        generateAnimatedPreview(
          finalPlaybackPath,
          previewPath,
          playbackProbe.durationSeconds,
          (measurement) => {
            progress.report(
              measurement.fraction,
              measurement.etaSeconds,
            );
          },
        ),
      ]);
      await progress.completeStage();

      const thumbnailObjectKey = `${objectPrefix}/thumbnail.jpg`;
      const previewObjectKey = `${objectPrefix}/preview.webp`;
      const [thumbnailFile, previewFile] = await Promise.all([
        stat(thumbnailPath),
        stat(previewPath),
      ]);
      const assetTotalBytes = thumbnailFile.size + previewFile.size;
      const assetProgress = new Map<string, number>([
        [thumbnailPath, 0],
        [previewPath, 0],
      ]);
      const assetUploadRate = new TransferRateEstimator();
      await progress.beginStage("uploading_assets");
      await Promise.all([
        storage.uploadFile(
          thumbnailPath,
          thumbnailObjectKey,
          (transferredBytes) => {
            assetProgress.set(thumbnailPath, transferredBytes);
            reportAggregateTransfer(
              assetProgress,
              assetTotalBytes,
              assetUploadRate,
              progress,
            );
          },
          progress.abortSignal,
        ),
        storage.uploadFile(
          previewPath,
          previewObjectKey,
          (transferredBytes) => {
            assetProgress.set(previewPath, transferredBytes);
            reportAggregateTransfer(
              assetProgress,
              assetTotalBytes,
              assetUploadRate,
              progress,
            );
          },
          progress.abortSignal,
        ),
      ]);
      await progress.completeStage();

      let hlsManifestObjectKey: string | null = null;
      if (playbackProbe.durationSeconds >= config.HLS_THRESHOLD_SECONDS) {
        await progress.beginStage("packaging_hls");
        await generateHLS(
          finalPlaybackPath,
          hlsDirectory,
          playbackProbe.durationSeconds,
          (measurement) => {
            progress.report(
              measurement.fraction * 0.8,
              measurement.etaSeconds,
            );
          },
        );
        const hlsUploadRate = new TransferRateEstimator();
        await storage.uploadDirectory(
          hlsDirectory,
          `${objectPrefix}/hls`,
          (transferredBytes, totalBytes) => {
            const measurement = hlsUploadRate.sample(
              transferredBytes,
              totalBytes,
            );
            progress.report(
              0.8 + measurement.fraction * 0.2,
              measurement.etaSeconds,
            );
          },
          progress.abortSignal,
        );
        await progress.completeStage();
        hlsManifestObjectKey = `${objectPrefix}/hls/index.m3u8`;
      }

      await progress.beginStage("finalizing");
      progress.report(1, 0, true);
      await progress.close();
      await repository.complete({
        videoID: video.id,
        leaseID,
        playbackObjectKey,
        thumbnailObjectKey,
        previewObjectKey,
        hlsManifestObjectKey,
        durationSeconds: playbackProbe.durationSeconds,
      });
      processingCompleted = true;
      await slackNotifier?.refreshVideo(video.id);

      console.log(
        JSON.stringify({
          level: "info",
          message: "Video processing completed.",
          videoID: video.id,
          durationSeconds: playbackProbe.durationSeconds,
          transcoded: !sourceProbe.isWebCompatible,
          generatedHLS: Boolean(hlsManifestObjectKey),
        }),
      );
    } catch (error) {
      progress.stop();
      let processingError = error;
      try {
        await progress.flush();
      } catch (progressError) {
        processingError = progressError;
      }
      if (!processingCompleted) {
        await repository.fail(video.id, leaseID, processingError);
        await slackNotifier?.refreshVideo(video.id).catch((slackError) => {
          console.error(
            JSON.stringify({
              level: "error",
              message: "Could not update failed Slack video unfurls.",
              videoID: video.id,
              error:
                slackError instanceof Error
                  ? slackError.message
                  : String(slackError),
            }),
          );
        });
      }
      throw processingError;
    } finally {
      await rm(workDirectory, { recursive: true, force: true });
    }
  } finally {
    await repository.close();
  }
}

function reportAggregateTransfer(
  transferredByFile: Map<string, number>,
  totalBytes: number,
  rate: TransferRateEstimator,
  progress: ProcessingProgressReporter,
) {
  const transferredBytes = [...transferredByFile.values()].reduce(
    (total, value) => total + value,
    0,
  );
  const measurement = rate.sample(transferredBytes, totalBytes);
  progress.report(measurement.fraction, measurement.etaSeconds);
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      level: "error",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }),
  );
  process.exitCode = 1;
});
