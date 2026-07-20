import { z } from "zod";

import {
  createRecorderToken,
  listRecorderTokens,
} from "@/features/auth/recorder-tokens";
import { apiErrorResponse } from "@/lib/api";
import {
  getRequestAuth,
  workspaceForbiddenResponse,
  workspaceUnauthorizedResponse,
} from "@/lib/session";
import { canManageWorkspace } from "@/features/auth/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createTokenSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export async function GET(request: Request) {
  const authentication = await getRequestAuth(request);
  if (!authentication) {
    return workspaceUnauthorizedResponse();
  }
  if (!canManageWorkspace(authentication.workspace.role)) {
    return workspaceForbiddenResponse();
  }

  try {
    return Response.json(
      { items: await listRecorderTokens(authentication.workspace.id) },
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
  const authentication = await getRequestAuth(request);
  if (!authentication) {
    return workspaceUnauthorizedResponse();
  }
  if (!canManageWorkspace(authentication.workspace.role)) {
    return workspaceForbiddenResponse();
  }

  try {
    const { name } = createTokenSchema.parse(await request.json());
    const token = await createRecorderToken(
      authentication.workspace.id,
      name,
      authentication.user.id,
    );
    return Response.json(token, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
