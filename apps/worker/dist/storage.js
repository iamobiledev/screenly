import { createReadStream, createWriteStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, PutObjectCommand, S3Client, } from "@aws-sdk/client-s3";
export class ObjectStorage {
    bucket;
    client;
    constructor(config) {
        this.bucket = config.S3_BUCKET;
        this.client = new S3Client({
            region: config.S3_REGION,
            endpoint: config.S3_ENDPOINT,
            forcePathStyle: config.S3_FORCE_PATH_STYLE,
            credentials: {
                accessKeyId: config.S3_ACCESS_KEY_ID,
                secretAccessKey: config.S3_SECRET_ACCESS_KEY,
            },
        });
    }
    async download(key, destination) {
        const response = await this.client.send(new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        }));
        if (!(response.Body instanceof Readable)) {
            throw new Error(`Object ${key} did not return a Node.js byte stream.`);
        }
        await pipeline(response.Body, createWriteStream(destination));
    }
    async uploadFile(filePath, key) {
        const file = await stat(filePath);
        await this.client.send(new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: createReadStream(filePath),
            ContentLength: file.size,
            ContentType: contentTypeFor(filePath),
            CacheControl: "public, max-age=31536000, immutable",
        }));
    }
    async uploadDirectory(directoryPath, keyPrefix) {
        const entries = await readdir(directoryPath, {
            recursive: true,
            withFileTypes: true,
        });
        for (const entry of entries) {
            if (!entry.isFile()) {
                continue;
            }
            const sourcePath = path.join(entry.parentPath, entry.name);
            const relativePath = path.relative(directoryPath, sourcePath);
            await this.uploadFile(sourcePath, `${keyPrefix}/${relativePath.split(path.sep).join("/")}`);
        }
    }
}
function contentTypeFor(filePath) {
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
