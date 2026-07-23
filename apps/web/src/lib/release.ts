import { getObjectMetadata } from "./storage";

const MAC_RELEASE_OBJECT_KEY = "releases/Screenly-latest.dmg";

export async function getMacRelease() {
  let publishedMetadata: Record<string, string> = {};
  try {
    publishedMetadata = await getObjectMetadata(MAC_RELEASE_OBJECT_KEY);
  } catch {
    // Keep the configured release available during transient storage failures.
  }

  return resolveMacRelease({
    downloadURL: process.env.MAC_APP_DOWNLOAD_URL,
    configuredVersion: process.env.MAC_APP_VERSION,
    configuredSHA256: process.env.MAC_APP_SHA256,
    publishedMetadata,
  });
}

export function resolveMacRelease(input: {
  downloadURL?: string;
  configuredVersion?: string;
  configuredSHA256?: string;
  publishedMetadata?: Record<string, string>;
}) {
  const version =
    validVersion(input.publishedMetadata?.version) ?? input.configuredVersion;
  if (!input.downloadURL || !version) {
    return null;
  }

  try {
    return {
      platform: "macos" as const,
      version,
      downloadURL: new URL(input.downloadURL).toString(),
      sha256:
        input.publishedMetadata?.sha256 ?? input.configuredSHA256 ?? null,
      minimumSystemVersion: "15.0",
    };
  } catch {
    throw new Error("MAC_APP_DOWNLOAD_URL must be a valid absolute URL.");
  }
}

export function getMacReleaseObjectKey() {
  return MAC_RELEASE_OBJECT_KEY;
}

function validVersion(value: string | undefined) {
  const version = value?.trim();
  return version && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)
    ? version
    : null;
}
