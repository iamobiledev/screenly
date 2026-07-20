import {
  listWorkspaceAccess,
} from "@/features/auth/invitations";
import { canManageWorkspace } from "@/features/auth/users";
import { apiErrorResponse } from "@/lib/api";
import {
  getRequestAuth,
  workspaceForbiddenResponse,
  workspaceUnauthorizedResponse,
} from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      await listWorkspaceAccess(authentication.workspace.id),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
