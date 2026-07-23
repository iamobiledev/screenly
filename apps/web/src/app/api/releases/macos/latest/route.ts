import { getMacRelease } from "@/lib/release";

export const dynamic = "force-dynamic";

export async function GET() {
  const release = await getMacRelease();

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

  return Response.json(release, {
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  });
}
