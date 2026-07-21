import { timingSafeEqual } from "node:crypto";

import { ZodError } from "zod";

import { DEFAULT_WORKSPACE_ID } from "@/db/schema";
import { InvitationError } from "@/features/auth/invitations";
import { authenticateRecorderToken } from "@/features/auth/recorder-tokens";

export async function authenticateUploadRequest(request: Request) {
  const expectedToken = process.env.UPLOAD_API_TOKEN;
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const receivedToken = authorization.slice("Bearer ".length);
  if (expectedToken) {
    const expected = Buffer.from(expectedToken);
    const received = Buffer.from(receivedToken);

    if (
      expected.length === received.length &&
      timingSafeEqual(expected, received)
    ) {
      return {
        recorderName: null,
        workspaceId: DEFAULT_WORKSPACE_ID,
        ownerUserId: null,
      };
    }
  }

  const recorder = await authenticateRecorderToken(receivedToken);
  return recorder
    ? {
        recorderName: recorder.name,
        workspaceId: recorder.workspaceId,
        ownerUserId: recorder.createdByUserId,
      }
    : null;
}

export function unauthorizedResponse() {
  return Response.json(
    {
      error: {
        code: "unauthorized",
        message: "A valid upload API token is required.",
      },
    },
    { status: 401 },
  );
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof InvitationError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return Response.json(
      {
        error: {
          code: "invalid_request",
          message: "The request body is invalid.",
          details: error.issues,
        },
      },
      { status: 400 },
    );
  }

  console.error(error);

  return Response.json(
    {
      error: {
        code: "internal_error",
        message: "The request could not be completed.",
      },
    },
    { status: 500 },
  );
}
