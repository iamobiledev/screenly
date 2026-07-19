import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { getConfig } from "./config.js";
import { VideoRepository } from "./database.js";
import { generateAnimatedPreview, generateHLS, generateThumbnail, probeMedia, transcodeToMP4, } from "./media.js";
import { ObjectStorage } from "./storage.js";
async function main() {
    const config = getConfig();
    const repository = new VideoRepository(config);
    const storage = new ObjectStorage(config);
    const leaseID = randomUUID();
    const video = await repository.claim(config.VIDEO_ID, leaseID);
    if (!video) {
        console.log(JSON.stringify({
            level: "info",
            message: "Video is already being processed or no longer needs work.",
            videoID: config.VIDEO_ID,
        }));
        return;
    }
    const workDirectory = path.join(config.PROCESSING_TEMP_DIR, `${video.id}-${leaseID}`);
    const sourceExtension = path.extname(video.sourceObjectKey) || ".mp4";
    const sourcePath = path.join(workDirectory, `source${sourceExtension}`);
    const playbackPath = path.join(workDirectory, "playback.mp4");
    const thumbnailPath = path.join(workDirectory, "thumbnail.jpg");
    const previewPath = path.join(workDirectory, "preview.webp");
    const hlsDirectory = path.join(workDirectory, "hls");
    const objectPrefix = `processed/${video.id}`;
    try {
        await mkdir(workDirectory, { recursive: true });
        console.log(JSON.stringify({
            level: "info",
            message: "Downloading source recording.",
            videoID: video.id,
        }));
        await storage.download(video.sourceObjectKey, sourcePath);
        const sourceProbe = await probeMedia(sourcePath);
        let finalPlaybackPath = sourcePath;
        let playbackObjectKey = video.sourceObjectKey;
        if (!sourceProbe.isWebCompatible) {
            console.log(JSON.stringify({
                level: "info",
                message: "Transcoding recording for browser playback.",
                videoID: video.id,
                audioTracks: sourceProbe.audio.length,
            }));
            await transcodeToMP4(sourcePath, playbackPath, sourceProbe);
            finalPlaybackPath = playbackPath;
            playbackObjectKey = `${objectPrefix}/video.mp4`;
            await storage.uploadFile(playbackPath, playbackObjectKey);
        }
        const playbackProbe = finalPlaybackPath === sourcePath
            ? sourceProbe
            : await probeMedia(finalPlaybackPath);
        await Promise.all([
            generateThumbnail(finalPlaybackPath, thumbnailPath, playbackProbe.durationSeconds),
            generateAnimatedPreview(finalPlaybackPath, previewPath, playbackProbe.durationSeconds),
        ]);
        const thumbnailObjectKey = `${objectPrefix}/thumbnail.jpg`;
        const previewObjectKey = `${objectPrefix}/preview.webp`;
        await Promise.all([
            storage.uploadFile(thumbnailPath, thumbnailObjectKey),
            storage.uploadFile(previewPath, previewObjectKey),
        ]);
        let hlsManifestObjectKey = null;
        if (playbackProbe.durationSeconds >= config.HLS_THRESHOLD_SECONDS) {
            await generateHLS(finalPlaybackPath, hlsDirectory);
            await storage.uploadDirectory(hlsDirectory, `${objectPrefix}/hls`);
            hlsManifestObjectKey = `${objectPrefix}/hls/index.m3u8`;
        }
        await repository.complete({
            videoID: video.id,
            leaseID,
            playbackObjectKey,
            thumbnailObjectKey,
            previewObjectKey,
            hlsManifestObjectKey,
            durationSeconds: playbackProbe.durationSeconds,
        });
        console.log(JSON.stringify({
            level: "info",
            message: "Video processing completed.",
            videoID: video.id,
            durationSeconds: playbackProbe.durationSeconds,
            transcoded: !sourceProbe.isWebCompatible,
            generatedHLS: Boolean(hlsManifestObjectKey),
        }));
    }
    catch (error) {
        await repository.fail(video.id, leaseID, error);
        throw error;
    }
    finally {
        await rm(workDirectory, { recursive: true, force: true });
    }
}
main().catch((error) => {
    console.error(JSON.stringify({
        level: "error",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
    }));
    process.exitCode = 1;
});
