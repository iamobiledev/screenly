import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
  UploadPartCommand,
  type CompletedPart,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { getServerEnv } from "@/lib/env";

const UPLOAD_URL_TTL_SECONDS = 15 * 60;
const PLAYBACK_URL_TTL_SECONDS = 60 * 60;

let client: S3Client | undefined;

function getStorageClient() {
  if (!client) {
    const env = getServerEnv();
    client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    });
  }

  return client;
}

export async function createMultipartUpload(input: {
  key: string;
  contentType: string;
  title: string;
}) {
  const env = getServerEnv();
  const result = await getStorageClient().send(
    new CreateMultipartUploadCommand({
      Bucket: env.S3_BUCKET,
      Key: input.key,
      ContentType: input.contentType,
      Metadata: {
        title: input.title,
      },
    }),
  );

  if (!result.UploadId) {
    throw new Error("The storage provider did not return a multipart upload ID.");
  }

  return result.UploadId;
}

export async function signUploadParts(input: {
  key: string;
  uploadId: string;
  partNumbers: number[];
}) {
  const env = getServerEnv();

  return Promise.all(
    input.partNumbers.map(async (partNumber) => ({
      partNumber,
      url: await getSignedUrl(
        getStorageClient(),
        new UploadPartCommand({
          Bucket: env.S3_BUCKET,
          Key: input.key,
          UploadId: input.uploadId,
          PartNumber: partNumber,
        }),
        { expiresIn: UPLOAD_URL_TTL_SECONDS },
      ),
    })),
  );
}

export async function completeMultipartUpload(input: {
  key: string;
  uploadId: string;
  parts: CompletedPart[];
}) {
  const env = getServerEnv();

  await getStorageClient().send(
    new CompleteMultipartUploadCommand({
      Bucket: env.S3_BUCKET,
      Key: input.key,
      UploadId: input.uploadId,
      MultipartUpload: {
        Parts: input.parts,
      },
    }),
  );
}

export async function objectExists(key: string) {
  const env = getServerEnv();

  try {
    await getStorageClient().send(
      new HeadObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
      }),
    );
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "NotFound" || error.name === "NoSuchKey")
    ) {
      return false;
    }

    throw error;
  }
}

export async function abortMultipartUpload(input: {
  key: string;
  uploadId: string;
}) {
  const env = getServerEnv();

  await getStorageClient().send(
    new AbortMultipartUploadCommand({
      Bucket: env.S3_BUCKET,
      Key: input.key,
      UploadId: input.uploadId,
    }),
  );
}

export async function getPlaybackUrl(key: string) {
  const env = getServerEnv();

  if (env.S3_PUBLIC_BASE_URL) {
    return `${env.S3_PUBLIC_BASE_URL.replace(/\/$/, "")}/${encodeObjectKey(key)}`;
  }

  return getSignedUrl(
    getStorageClient(),
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
    }),
    { expiresIn: PLAYBACK_URL_TTL_SECONDS },
  );
}

export async function deleteObjects(keys: Array<string | null>) {
  const objectKeys = [...new Set(keys.filter((key): key is string => Boolean(key)))];

  if (objectKeys.length === 0) {
    return;
  }

  const env = getServerEnv();
  const result = await getStorageClient().send(
    new DeleteObjectsCommand({
      Bucket: env.S3_BUCKET,
      Delete: {
        Objects: objectKeys.map((Key) => ({ Key })),
        Quiet: true,
      },
    }),
  );

  if (result.Errors?.length) {
    throw new Error(
      `Object deletion failed for: ${result.Errors.map((error) => error.Key).join(", ")}`,
    );
  }
}

export async function deleteObjectPrefix(prefix: string) {
  const env = getServerEnv();
  let continuationToken: string | undefined;

  do {
    const result = await getStorageClient().send(
      new ListObjectsV2Command({
        Bucket: env.S3_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    await deleteObjects(result.Contents?.map((object) => object.Key ?? null) ?? []);
    continuationToken = result.NextContinuationToken;
  } while (continuationToken);
}

function encodeObjectKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}
