export function getMacRelease() {
  const downloadURL = process.env.MAC_APP_DOWNLOAD_URL;
  const version = process.env.MAC_APP_VERSION;

  if (!downloadURL || !version) {
    return null;
  }

  try {
    return {
      platform: "macos" as const,
      version,
      downloadURL: new URL(downloadURL).toString(),
      sha256: process.env.MAC_APP_SHA256 ?? null,
      minimumSystemVersion: "15.0",
    };
  } catch {
    throw new Error("MAC_APP_DOWNLOAD_URL must be a valid absolute URL.");
  }
}
