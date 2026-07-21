import type {
  PendingSlackUnfurl,
  SlackVideo,
  VideoRepository,
} from "./database.js";

const MAXIMUM_ATTEMPTS = 3;

export class SlackNotifier {
  constructor(
    private readonly repository: VideoRepository,
    private readonly appUrl: string,
    private readonly botToken: string,
  ) {}

  async refreshVideo(videoID: string) {
    const video = await this.repository.getSlackVideo(videoID);
    if (!video) {
      return;
    }

    const unfurls =
      await this.repository.listPendingSlackUnfurls(video.id);
    const failures: Error[] = [];

    for (const unfurl of unfurls) {
      await this.repository.markSlackUnfurlAttempt(unfurl.id);
      try {
        await this.sendUnfurl(
          unfurl,
          buildUnfurl(video, unfurl.sharedUrl, this.appUrl),
        );
        await this.repository.markSlackUnfurlDelivered(
          unfurl.id,
          video.status,
        );
      } catch (error) {
        await this.repository.markSlackUnfurlFailed(unfurl.id, error);
        failures.push(
          error instanceof Error
            ? error
            : new Error("Unknown Slack unfurl failure"),
        );
      }
    }

    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `Could not refresh ${failures.length} Slack video unfurl(s).`,
      );
    }
  }

  private async sendUnfurl(
    target: PendingSlackUnfurl,
    content: { blocks: Array<Record<string, unknown>> },
  ) {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAXIMUM_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch("https://slack.com/api/chat.unfurl", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.botToken}`,
            "Content-Type": "application/json; charset=utf-8",
          },
          body: JSON.stringify({
            ...(target.unfurlId && target.source
              ? {
                  unfurl_id: target.unfurlId,
                  source: target.source,
                }
              : {
                  channel: target.channelId,
                  ts: target.messageTs,
                }),
            unfurls: JSON.stringify({
              [target.sharedUrl]: content,
            }),
          }),
        });

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
        lastError = new Error(
          `Slack could not refresh the video unfurl (${errorCode}).`,
        );
        if (
          response.status < 500 &&
          ![
            "internal_error",
            "request_timeout",
            "service_unavailable",
          ].includes(errorCode)
        ) {
          break;
        }
      } catch (error) {
        lastError =
          error instanceof Error
            ? error
            : new Error("Slack unfurl request failed.");
      }

      if (attempt < MAXIMUM_ATTEMPTS) {
        await sleep(250 * 2 ** (attempt - 1));
      }
    }

    throw lastError ?? new Error("Slack unfurl request failed.");
  }
}

function buildUnfurl(
  video: SlackVideo,
  sharedUrl: string,
  appUrl: string,
) {
  const title = truncate(video.title, 150);

  if (video.status === "failed") {
    return {
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: title, emoji: true },
        },
        {
          type: "section",
          text: {
            type: "plain_text",
            text: "Video processing failed. Open Screenly for details.",
            emoji: true,
          },
        },
      ],
    };
  }

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
          text: truncate(
            `Shared by ${video.recorderName} on Screenly`,
            200,
          ),
          emoji: true,
        },
        video_url: new URL(
          `/embed/v/${encodeURIComponent(video.slug)}`,
          appUrl,
        ).toString(),
        thumbnail_url: new URL(
          `/api/videos/${encodeURIComponent(video.slug)}/thumbnail`,
          appUrl,
        ).toString(),
        alt_text: truncate(`Play ${video.title}`, 200),
        provider_name: "Screenly",
      },
    ],
  };
}

function truncate(value: string, maximumLength: number) {
  const normalized = value.trim() || "Untitled recording";
  return normalized.length <= maximumLength
    ? normalized
    : `${normalized.slice(0, maximumLength - 1)}…`;
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
