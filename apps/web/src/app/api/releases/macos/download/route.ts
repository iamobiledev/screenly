import { getMacRelease, getMacReleaseObjectKey } from "@/lib/release";
import { getDownloadUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const release = getMacRelease();

  if (!release) {
    return Response.json(
      {
        error: {
          code: "release_unavailable",
          message: "No macOS release is currently published.",
        },
      },
      { status: 404 },
    );
  }

  const signedURL = await getDownloadUrl(
    getMacReleaseObjectKey(release.version),
    `Screenly-${release.version}.dmg`,
  );

  return Response.redirect(signedURL, 307);
}
