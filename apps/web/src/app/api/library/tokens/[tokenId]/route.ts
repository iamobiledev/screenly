import { z } from "zod";

import { revokeRecorderToken } from "@/features/auth/recorder-tokens";
import { apiErrorResponse } from "@/lib/api";
import {
  isRequestAuthenticated,
  workspaceUnauthorizedResponse,
} from "@/lib/session";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ tokenId: string }> },
) {
  if (!isRequestAuthenticated(request)) {
    return workspaceUnauthorizedResponse();
  }

  try {
    const { tokenId } = await params;
    const revoked = await revokeRecorderToken(z.uuid().parse(tokenId));
    return revoked
      ? new Response(null, { status: 204 })
      : Response.json(
          {
            error: {
              code: "token_not_found",
              message: "The recorder token does not exist.",
            },
          },
          { status: 404 },
        );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
