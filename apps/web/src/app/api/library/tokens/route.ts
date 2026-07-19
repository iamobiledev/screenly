import { z } from "zod";

import {
  createRecorderToken,
  listRecorderTokens,
} from "@/features/auth/recorder-tokens";
import { apiErrorResponse } from "@/lib/api";
import {
  isRequestAuthenticated,
  workspaceUnauthorizedResponse,
} from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createTokenSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export async function GET(request: Request) {
  if (!isRequestAuthenticated(request)) {
    return workspaceUnauthorizedResponse();
  }

  try {
    return Response.json(
      { items: await listRecorderTokens() },
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

export async function POST(request: Request) {
  if (!isRequestAuthenticated(request)) {
    return workspaceUnauthorizedResponse();
  }

  try {
    const { name } = createTokenSchema.parse(await request.json());
    const token = await createRecorderToken(name);
    return Response.json(token, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
