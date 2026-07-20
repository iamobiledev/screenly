import { createReadStream, createWriteStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import type { WorkerConfig } from "./config.js";

type TransferProgressCallback = (
  transferredBytes: number,
  totalBytes: number,
) => void;

export class ObjectStorage {
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor(config: WorkerConfig) {
    this.bucket = config.STORAGE_BUCKET;
    this.client = new S3Client({
      region:
        config.STORAGE_BACKEND === "gcs" ? "auto" : config.STORAGE_REGION,
      endpoint:
        config.STORAGE_BACKEND === "gcs"
          ? "https://storage.googleapis.com"
          : config.STORAGE_ENDPOINT,
      forcePathStyle:
        config.STORAGE_BACKEND === "gcs"
          ? false
          : config.STORAGE_FORCE_PATH_STYLE,
      requestChecksumCalculation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: config.STORAGE_ACCESS_KEY_ID,
        secretAccessKey: config.STORAGE_SECRET_ACCESS_KEY,
      },
    });
  }

  async download(
    key: string,
    destination: string,
    onProgress?: TransferProgressCallback,
  ) {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

    if (!(response.Body instanceof Readable)) {
      throw new Error(`Object ${key} did not return a Node.js byte stream.`);
    }

    const totalBytes = Number(response.ContentLength ?? 0);
    const counter = createCountingTransform(totalBytes, onProgress);
    await pipeline(response.Body, counter, createWriteStream(destination));
  }

  async uploadFile(
    filePath: string,
    key: string,
    onProgress?: TransferProgressCallback,
  ) {
    const file = await stat(filePath);
    const counter = createCountingTransform(file.size, onProgress);
    const source = createReadStream(filePath);
    source.once("error", (error) => counter.destroy(error));
    source.pipe(counter);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: counter,
        ContentLength: file.size,
        ContentType: contentTypeFor(filePath),
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  }

  async uploadDirectory(
    directoryPath: string,
    keyPrefix: string,
    onProgress?: TransferProgressCallback,
  ) {
    const entries = await readdir(directoryPath, {
      recursive: true,
      withFileTypes: true,
    });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map(async (entry) => {
          const sourcePath = path.join(entry.parentPath, entry.name);
          const file = await stat(sourcePath);
          return { sourcePath, size: file.size };
        }),
    );
    const totalBytes = files.reduce((total, file) => total + file.size, 0);
    let completedBytes = 0;

    for (const file of files) {
      const relativePath = path.relative(directoryPath, file.sourcePath);
      await this.uploadFile(
        file.sourcePath,
        `${keyPrefix}/${relativePath.split(path.sep).join("/")}`,
        (transferredBytes) => {
          onProgress?.(completedBytes + transferredBytes, totalBytes);
        },
      );
      completedBytes += file.size;
    }
    onProgress?.(totalBytes, totalBytes);
  }
}

function createCountingTransform(
  totalBytes: number,
  onProgress?: TransferProgressCallback,
) {
  let transferredBytes = 0;
  onProgress?.(0, totalBytes);

  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      transferredBytes += chunk.length;
      onProgress?.(transferredBytes, totalBytes);
      callback(null, chunk);
    },
  });
}

function contentTypeFor(filePath: string) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".mp4":
      return "video/mp4";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".m3u8":
      return "application/vnd.apple.mpegurl";
    case ".m4s":
      return "video/iso.segment";
    case ".ts":
      return "video/mp2t";
    default:
      return "application/octet-stream";
  }
}
