import { z } from "zod";

import { listLibraryVideos } from "@/features/videos/library-service";
import { apiErrorResponse } from "@/lib/api";
import {
  getRequestAuth,
  workspaceUnauthorizedResponse,
} from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.string().trim().max(120).optional();

export async function GET(request: Request) {
  const authentication = await getRequestAuth(request);
  if (!authentication) {
    return workspaceUnauthorizedResponse();
  }

  try {
    const query = querySchema.parse(new URL(request.url).searchParams.get("q") ?? undefined);
    const items = await listLibraryVideos(authentication.workspace.id, query);

    return Response.json(
      { items },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
