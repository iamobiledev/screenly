import { z } from "zod";

import {
  authenticateDeviceRequest,
  createDeviceSession,
  deviceUnauthorizedResponse,
  revokeDeviceSession,
} from "@/features/auth/device-sessions";
import {
  createRecorderToken,
  revokeRecorderTokensForDevice,
} from "@/features/auth/recorder-tokens";
import {
  authenticateCredentials,
  listUserWorkspaces,
} from "@/features/auth/users";
import {
  apiErrorResponse,
} from "@/lib/api";

export const runtime = "nodejs";

const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(1_024),
  deviceName: z.string().trim().min(1).max(120),
});

export async function POST(request: Request) {
  try {
    const input = loginSchema.parse(await request.json());
    const user = await authenticateCredentials(input.username, input.password);
    const workspaces = user ? await listUserWorkspaces(user.id) : [];
    const activeWorkspace = workspaces[0];

    if (!user || !activeWorkspace) {
      return invalidCredentialsResponse();
    }

    const [session, recorderToken] = await Promise.all([
      createDeviceSession(user.id, input.deviceName),
      createRecorderToken(activeWorkspace.id, input.deviceName, user.id),
    ]);

    return Response.json(
      {
        sessionToken: session.token,
        sessionExpiresAt: session.expiresAt,
        user,
        workspaces,
        activeWorkspace,
        recorderToken,
      },
      { status: 201 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const authentication = await authenticateDeviceRequest(request);
    if (!authentication) {
      return deviceUnauthorizedResponse();
    }

    return Response.json({
      user: authentication.user,
      workspaces: await listUserWorkspaces(authentication.user.id),
      sessionExpiresAt: authentication.expiresAt,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const revokedSession = await revokeDeviceSession(request);
    if (!revokedSession) {
      return deviceUnauthorizedResponse();
    }

    await revokeRecorderTokensForDevice(
      revokedSession.userId,
      revokedSession.deviceName,
    );
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

function invalidCredentialsResponse() {
  return Response.json(
    {
      error: {
        code: "invalid_credentials",
        message: "The username or password is incorrect.",
      },
    },
    { status: 401 },
  );
}
