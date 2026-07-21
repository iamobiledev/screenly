import { createHmac, timingSafeEqual } from "node:crypto";

import {
  formatProcessingEta,
  processingStageLabel,
} from "./format-processing";

const SLACK_SIGNATURE_MAX_AGE_SECONDS = 5 * 60;
const MAXIMUM_SLACK_ATTEMPTS = 3;

export type SlackUnfurlTarget = {
  channelId: string;
  messageTs: string;
  unfurlId: string | null;
  source: string | null;
  sharedUrl: string;
};

export type SlackUnfurlVideo = {
  slug: string;
  title: string;
  recorderName: string;
  status: "uploading" | "processing" | "ready" | "failed";
  processingStage: string | null;
  progressPercent: number | null;
  etaSeconds: number | null;
  hasThumbnail: boolean;
};

export type SlackUnfurlContent = {
  blocks: Array<Record<string, unknown>>;
};

export function verifySlackRequest(input: {
  body: string;
  timestamp: string | null;
  signature: string | null;
  signingSecret: string;
  nowSeconds?: number;
}) {
  if (!input.timestamp || !input.signature) {
    return false;
  }

  const timestamp = Number(input.timestamp);
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1_000);
  if (
    !Number.isInteger(timestamp) ||
    Math.abs(nowSeconds - timestamp) > SLACK_SIGNATURE_MAX_AGE_SECONDS
  ) {
    return false;
  }

  const expectedSignature = `v0=${createHmac("sha256", input.signingSecret)
    .update(`v0:${input.timestamp}:${input.body}`)
    .digest("hex")}`;
  const expected = Buffer.from(expectedSignature);
  const received = Buffer.from(input.signature);

  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

export function parseScreenlyShareUrl(sharedUrl: string, appUrl: string) {
  try {
    const shared = new URL(sharedUrl);
    const application = new URL(appUrl);
    if (
      shared.origin !== application.origin ||
      shared.username ||
      shared.password ||
      shared.search ||
      shared.hash
    ) {
      return null;
    }

    const match = shared.pathname.match(/^\/v\/([A-Za-z0-9_-]{1,16})\/?$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function buildSlackUnfurl(
  video: SlackUnfurlVideo,
  sharedUrl: string,
  appUrl: string,
): SlackUnfurlContent {
  const title = truncatePlainText(video.title, 150);

  if (video.status === "ready" && video.hasThumbnail) {
    const embedUrl = new URL(
      `/embed/v/${encodeURIComponent(video.slug)}`,
      appUrl,
    ).toString();
    const thumbnailUrl = new URL(
      `/api/videos/${encodeURIComponent(video.slug)}/thumbnail`,
      appUrl,
    ).toString();

    return {
      blocks: [
        {
          type: "video",
          title: {
            type: "plain_text",
            text: title,
            emoji: true,
          },
          title_url: sharedUrl,
          description: {
            type: "plain_text",
            text: truncatePlainText(
              `Shared by ${video.recorderName} on Screenly`,
              200,
            ),
            emoji: true,
          },
          video_url: embedUrl,
          thumbnail_url: thumbnailUrl,
          alt_text: truncatePlainText(`Play ${video.title}`, 200),
          provider_name: "Screenly",
        },
      ],
    };
  }

  if (video.status === "failed") {
    return messageUnfurl(
      title,
      "Video processing failed. Open Screenly for details.",
    );
  }

  if (video.status === "ready") {
    return messageUnfurl(
      title,
      "The video is ready. Open Screenly to watch it.",
    );
  }

  if (video.status === "uploading") {
    return messageUnfurl(
      title,
      "The recording is still uploading. This preview will update when it is ready.",
    );
  }

  const stage = processingStageLabel(video.processingStage);
  const progress =
    video.progressPercent === null ? "" : ` · ${video.progressPercent}%`;
  const eta =
    video.etaSeconds === null ? "" : ` · ${formatProcessingEta(video.etaSeconds)}`;
  return messageUnfurl(
    title,
    `${stage}${progress}${eta}. This preview will update automatically.`,
  );
}

export async function chatUnfurl(input: {
  token: string;
  target: SlackUnfurlTarget;
  content: SlackUnfurlContent;
  fetchImplementation?: typeof fetch;
}) {
  const fetchImplementation = input.fetchImplementation ?? fetch;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAXIMUM_SLACK_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImplementation(
        "https://slack.com/api/chat.unfurl",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.token}`,
            "Content-Type": "application/json; charset=utf-8",
          },
          body: JSON.stringify({
            ...(input.target.unfurlId && input.target.source
              ? {
                  unfurl_id: input.target.unfurlId,
                  source: input.target.source,
                }
              : {
                  channel: input.target.channelId,
                  ts: input.target.messageTs,
                }),
            unfurls: JSON.stringify({
              [input.target.sharedUrl]: input.content,
            }),
          }),
          cache: "no-store",
        },
      );

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "1");
        await sleep(
          Math.min(10, Number.isFinite(retryAfter) ? retryAfter : 1) * 1_000,
        );
        continue;
      }

      const result = (await response.json().catch(() => null)) as {
        ok?: unknown;
        error?: unknown;
      } | null;
      if (response.ok && result?.ok === true) {
        return;
      }

      const errorCode =
        typeof result?.error === "string"
          ? result.error
          : `http_${response.status}`;
      lastError = new Error(`Slack could not unfurl the video (${errorCode}).`);
      if (
        response.status < 500 &&
        !["internal_error", "request_timeout", "service_unavailable"].includes(
          errorCode,
        )
      ) {
        break;
      }
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error("Slack unfurl request failed.");
    }

    if (attempt < MAXIMUM_SLACK_ATTEMPTS) {
      await sleep(250 * 2 ** (attempt - 1));
    }
  }

  throw lastError ?? new Error("Slack unfurl request failed.");
}

function messageUnfurl(title: string, message: string): SlackUnfurlContent {
  return {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: title,
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "plain_text",
          text: truncatePlainText(message, 2_000),
          emoji: true,
        },
      },
    ],
  };
}

function truncatePlainText(value: string, maximumLength: number) {
  const normalized = value.trim() || "Untitled recording";
  return normalized.length <= maximumLength
    ? normalized
    : `${normalized.slice(0, maximumLength - 1)}…`;
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
