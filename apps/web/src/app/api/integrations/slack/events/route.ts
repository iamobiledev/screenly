import { after } from "next/server";
import { z } from "zod";

import { handleSlackLinkSharedEvent } from "@/features/videos/slack-unfurls";
import { getServerEnv } from "@/lib/env";
import { verifySlackRequest } from "@/lib/slack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const urlVerificationSchema = z.object({
  type: z.literal("url_verification"),
  challenge: z.string().min(1).max(1_000),
});

const eventCallbackSchema = z.object({
  type: z.literal("event_callback"),
  team_id: z.string().min(1).max(64),
  event: z.object({
    type: z.literal("link_shared"),
    channel: z.string().min(1).max(64),
    message_ts: z.string().min(1).max(80),
    unfurl_id: z.string().min(1).max(500).optional(),
    source: z.string().min(1).max(32).optional(),
    links: z
      .array(
        z.object({
          url: z.url().max(2_000),
        }),
      )
      .min(1)
      .max(20),
  }),
});

export async function POST(request: Request) {
  const env = getServerEnv();
  if (!env.SLACK_SIGNING_SECRET || !env.SLACK_BOT_TOKEN || !env.APP_URL) {
    return Response.json(
      {
        error: {
          code: "slack_not_configured",
          message: "Slack link unfurling is not configured.",
        },
      },
      { status: 503 },
    );
  }

  const body = await request.text();
  if (
    !verifySlackRequest({
      body,
      timestamp: request.headers.get("x-slack-request-timestamp"),
      signature: request.headers.get("x-slack-signature"),
      signingSecret: env.SLACK_SIGNING_SECRET,
    })
  ) {
    return Response.json(
      {
        error: {
          code: "invalid_slack_signature",
          message: "The Slack request signature is invalid.",
        },
      },
      { status: 401 },
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return Response.json(
      {
        error: {
          code: "invalid_slack_payload",
          message: "The Slack request body is invalid.",
        },
      },
      { status: 400 },
    );
  }

  const verification = urlVerificationSchema.safeParse(payload);
  if (verification.success) {
    return Response.json({ challenge: verification.data.challenge });
  }

  const callback = eventCallbackSchema.safeParse(payload);
  if (!callback.success) {
    return Response.json(
      {
        error: {
          code: "unsupported_slack_event",
          message: "The Slack event is not supported.",
        },
      },
      { status: 400 },
    );
  }

  const event = callback.data.event;
  after(() =>
    handleSlackLinkSharedEvent(
      {
        teamId: callback.data.team_id,
        channelId: event.channel,
        messageTs: event.message_ts,
        unfurlId: event.unfurl_id ?? null,
        source: event.source ?? null,
        links: event.links,
      },
      {
        appUrl: env.APP_URL!,
        botToken: env.SLACK_BOT_TOKEN!,
      },
    ),
  );

  return new Response(null, { status: 200 });
}
