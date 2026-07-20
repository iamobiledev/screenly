import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";

type ProbeStream = {
  codec_type?: string;
  codec_name?: string;
  pix_fmt?: string;
};

export type MediaProbe = {
  durationSeconds: number;
  video: ProbeStream;
  audio: ProbeStream[];
  isWebCompatible: boolean;
};

export type MediaProgress = {
  fraction: number;
  speed: number | null;
  etaSeconds: number | null;
};

type MediaProgressCallback = (progress: MediaProgress) => void;

export async function probeMedia(inputPath: string): Promise<MediaProbe> {
  const output = await run("ffprobe", [
    "-v",
    "error",
    "-show_streams",
    "-show_format",
    "-of",
    "json",
    inputPath,
  ]);

  const result = JSON.parse(output) as {
    streams?: ProbeStream[];
    format?: { duration?: string };
  };
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
    isWebCompatible:
      video.codec_name === "h264" &&
      video.pix_fmt === "yuv420p" &&
      audio.length <= 1 &&
      (audio.length === 0 || audio[0]?.codec_name === "aac"),
  };
}

export async function transcodeToMP4(
  inputPath: string,
  outputPath: string,
  probe: MediaProbe,
  onProgress?: MediaProgressCallback,
) {
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
  } else if (probe.audio.length === 1) {
    argumentsList.push(
      "-map",
      "0:a:0",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
    );
  } else {
    const inputs = probe.audio
      .map((_, index) => `[0:a:${index}]`)
      .join("");
    argumentsList.push(
      "-filter_complex",
      `${inputs}amix=inputs=${probe.audio.length}:duration=longest:dropout_transition=2:normalize=0[aout]`,
      "-map",
      "[aout]",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
    );
  }

  argumentsList.push(outputPath);
  await runFfmpeg(argumentsList, probe.durationSeconds, onProgress);
}

export async function generateThumbnail(
  inputPath: string,
  outputPath: string,
  durationSeconds: number,
) {
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

export async function generateAnimatedPreview(
  inputPath: string,
  outputPath: string,
  durationSeconds: number,
  onProgress?: MediaProgressCallback,
) {
  const previewDuration = Math.min(6, durationSeconds);
  await runFfmpeg([
    "-y",
    "-ss",
    Math.min(1, durationSeconds * 0.1).toFixed(3),
    "-t",
    previewDuration.toFixed(3),
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
  ], previewDuration, onProgress);
}

export async function generateHLS(
  inputPath: string,
  outputDirectory: string,
  durationSeconds: number,
  onProgress?: MediaProgressCallback,
) {
  await mkdir(outputDirectory, { recursive: true });
  await runFfmpeg([
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
  ], durationSeconds, onProgress);
}

async function run(command: string, argumentsList: string[]) {
  return new Promise<string>((resolve, reject) => {
    const process = spawn(command, argumentsList, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    process.stdout.setEncoding("utf8");
    process.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    process.stderr.setEncoding("utf8");
    process.stderr.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-64 * 1_024);
    });
    process.once("error", reject);
    process.once("exit", (code, signal) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(
        new Error(
          `${command} failed (${signal ?? code ?? "unknown"}): ${stderr.trim()}`,
        ),
      );
    });
  });
}

async function runFfmpeg(
  argumentsList: string[],
  durationSeconds: number,
  onProgress?: MediaProgressCallback,
) {
  const outputPath = argumentsList.at(-1);
  if (!outputPath) {
    throw new Error("ffmpeg requires an output path.");
  }

  const ffmpegArguments = [
    ...argumentsList.slice(0, -1),
    "-progress",
    "pipe:1",
    "-nostats",
    outputPath,
  ];

  return new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", ffmpegArguments, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdoutBuffer = "";
    let stderr = "";
    let progressRecord: Record<string, string> = {};

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdoutBuffer += chunk;
      let newlineIndex = stdoutBuffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = stdoutBuffer.slice(0, newlineIndex).trim();
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        const separatorIndex = line.indexOf("=");
        if (separatorIndex > 0) {
          const key = line.slice(0, separatorIndex);
          progressRecord[key] = line.slice(separatorIndex + 1);
          if (key === "progress") {
            const progress = parseFfmpegProgress(
              progressRecord,
              durationSeconds,
            );
            if (progress) {
              onProgress?.(progress);
            }
            progressRecord = {};
          }
        }
        newlineIndex = stdoutBuffer.indexOf("\n");
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-64 * 1_024);
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        onProgress?.({ fraction: 1, speed: null, etaSeconds: 0 });
        resolve();
        return;
      }
      reject(
        new Error(
          `ffmpeg failed (${signal ?? code ?? "unknown"}): ${stderr.trim()}`,
        ),
      );
    });
  });
}

export function parseFfmpegProgress(
  record: Record<string, string>,
  durationSeconds: number,
): MediaProgress | null {
  const outputMicroseconds = Number(record.out_time_us ?? record.out_time_ms);
  const outputSeconds = Number.isFinite(outputMicroseconds)
    ? outputMicroseconds / 1_000_000
    : parseFfmpegTime(record.out_time);
  if (!Number.isFinite(outputSeconds) || durationSeconds <= 0) {
    return null;
  }

  const speedValue = Number(record.speed?.replace(/x$/, ""));
  const speed = Number.isFinite(speedValue) && speedValue > 0 ? speedValue : null;
  const fraction =
    record.progress === "end"
      ? 1
      : Math.min(1, Math.max(0, outputSeconds / durationSeconds));
  const remainingMediaSeconds = Math.max(0, durationSeconds - outputSeconds);

  return {
    fraction,
    speed,
    etaSeconds: speed === null ? null : remainingMediaSeconds / speed,
  };
}

function parseFfmpegTime(value: string | undefined) {
  if (!value) {
    return Number.NaN;
  }
  const match = value.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (!match) {
    return Number.NaN;
  }
  return (
    Number(match[1]) * 3_600 +
    Number(match[2]) * 60 +
    Number(match[3])
  );
}
