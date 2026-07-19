import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
export async function probeMedia(inputPath) {
    const output = await run("ffprobe", [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        inputPath,
    ]);
    const result = JSON.parse(output);
    const streams = result.streams ?? [];
    const video = streams.find((stream) => stream.codec_type === "video");
    const audio = streams.filter((stream) => stream.codec_type === "audio");
    if (!video) {
        throw new Error("The uploaded file does not contain a video stream.");
    }
    const durationSeconds = Number(result.format?.duration);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        throw new Error("The uploaded video has an invalid duration.");
    }
    return {
        durationSeconds,
        video,
        audio,
        isWebCompatible: video.codec_name === "h264" &&
            video.pix_fmt === "yuv420p" &&
            audio.length <= 1 &&
            (audio.length === 0 || audio[0]?.codec_name === "aac"),
    };
}
export async function transcodeToMP4(inputPath, outputPath, probe) {
    const argumentsList = [
        "-y",
        "-i",
        inputPath,
        "-map",
        "0:v:0",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "22",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
    ];
    if (probe.audio.length === 0) {
        argumentsList.push("-an");
    }
    else if (probe.audio.length === 1) {
        argumentsList.push("-map", "0:a:0", "-c:a", "aac", "-b:a", "160k");
    }
    else {
        const inputs = probe.audio
            .map((_, index) => `[0:a:${index}]`)
            .join("");
        argumentsList.push("-filter_complex", `${inputs}amix=inputs=${probe.audio.length}:duration=longest:dropout_transition=2:normalize=0[aout]`, "-map", "[aout]", "-c:a", "aac", "-b:a", "160k");
    }
    argumentsList.push(outputPath);
    await run("ffmpeg", argumentsList);
}
export async function generateThumbnail(inputPath, outputPath, durationSeconds) {
    const seekTime = Math.min(1, Math.max(0, durationSeconds * 0.1));
    await run("ffmpeg", [
        "-y",
        "-ss",
        seekTime.toFixed(3),
        "-i",
        inputPath,
        "-frames:v",
        "1",
        "-vf",
        "scale='min(1280,iw)':-2",
        "-q:v",
        "3",
        outputPath,
    ]);
}
export async function generateAnimatedPreview(inputPath, outputPath, durationSeconds) {
    await run("ffmpeg", [
        "-y",
        "-ss",
        Math.min(1, durationSeconds * 0.1).toFixed(3),
        "-t",
        Math.min(6, durationSeconds).toFixed(3),
        "-i",
        inputPath,
        "-an",
        "-vf",
        "fps=8,scale=480:-2:flags=lanczos",
        "-c:v",
        "libwebp",
        "-quality",
        "72",
        "-loop",
        "0",
        outputPath,
    ]);
}
export async function generateHLS(inputPath, outputDirectory) {
    await mkdir(outputDirectory, { recursive: true });
    await run("ffmpeg", [
        "-y",
        "-i",
        inputPath,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-c",
        "copy",
        "-hls_time",
        "6",
        "-hls_playlist_type",
        "vod",
        "-hls_segment_type",
        "fmp4",
        "-hls_fmp4_init_filename",
        "init.mp4",
        "-hls_segment_filename",
        path.join(outputDirectory, "segment-%05d.m4s"),
        path.join(outputDirectory, "index.m3u8"),
    ]);
}
async function run(command, argumentsList) {
    return new Promise((resolve, reject) => {
        const process = spawn(command, argumentsList, {
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        process.stdout.setEncoding("utf8");
        process.stdout.on("data", (chunk) => {
            stdout += chunk;
        });
        process.stderr.setEncoding("utf8");
        process.stderr.on("data", (chunk) => {
            stderr = `${stderr}${chunk}`.slice(-64 * 1_024);
        });
        process.once("error", reject);
        process.once("exit", (code, signal) => {
            if (code === 0) {
                resolve(stdout);
                return;
            }
            reject(new Error(`${command} failed (${signal ?? code ?? "unknown"}): ${stderr.trim()}`));
        });
    });
}
