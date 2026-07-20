import { z } from "zod";

import {
  authenticateDeviceRequest,
  deviceUnauthorizedResponse,
} from "@/features/auth/device-sessions";
import { createRecorderToken } from "@/features/auth/recorder-tokens";
import { getUserWorkspace } from "@/features/auth/users";
import { apiErrorResponse } from "@/lib/api";

export const runtime = "nodejs";

const switchWorkspaceSchema = z.object({
  workspaceId: z.uuid(),
  deviceName: z.string().trim().min(1).max(120),
});

export async function POST(request: Request) {
  try {
    const authentication = await authenticateDeviceRequest(request);
    if (!authentication) {
      return deviceUnauthorizedResponse();
    }

    const input = switchWorkspaceSchema.parse(await request.json());
    const activeWorkspace = await getUserWorkspace(
      authentication.user.id,
      input.workspaceId,
    );
    if (!activeWorkspace) {
      return Response.json(
        {
          error: {
            code: "workspace_not_found",
            message: "You are not a member of that workspace.",
          },
        },
        { status: 404 },
      );
    }

    const recorderToken = await createRecorderToken(
      activeWorkspace.id,
      input.deviceName,
      authentication.user.id,
    );

    return Response.json({ activeWorkspace, recorderToken }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
