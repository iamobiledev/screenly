import { getPublicVideoBySlug } from "@/features/videos/video-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const video = await getPublicVideoBySlug(slug);

  if (
    !video ||
    video.status !== "ready" ||
    !video.thumbnailUrl
  ) {
    return new Response(null, { status: 404 });
  }

  return new Response(null, {
    status: 307,
    headers: {
      "Cache-Control": "private, no-store",
      Location: video.thumbnailUrl,
    },
  });
}
