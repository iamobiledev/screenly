import { timingSafeEqual } from "node:crypto";

import { ZodError } from "zod";

export function isUploadAuthorized(request: Request) {
  const expectedToken = process.env.UPLOAD_API_TOKEN;
  const authorization = request.headers.get("authorization");

  if (!expectedToken || !authorization?.startsWith("Bearer ")) {
    return false;
  }

  const receivedToken = authorization.slice("Bearer ".length);
  const expected = Buffer.from(expectedToken);
  const received = Buffer.from(receivedToken);

  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
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
