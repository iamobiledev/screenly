import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { slackUnfurls, videos } from "@/db/schema";
import { dispatchProcessingJob } from "@/lib/processing";
import {
  buildSlackUnfurl,
  chatUnfurl,
  parseScreenlyShareUrl,
  type SlackUnfurlTarget,
} from "@/lib/slack";

export type SlackLinkSharedEvent = {
  teamId: string;
  channelId: string;
  messageTs: string;
  unfurlId: string | null;
  source: string | null;
  links: Array<{ url: string }>;
};

export async function handleSlackLinkSharedEvent(
  event: SlackLinkSharedEvent,
  config: {
    appUrl: string;
    botToken: string;
  },
) {
  for (const link of event.links) {
    const slug = parseScreenlyShareUrl(link.url, config.appUrl);
    if (!slug) {
      continue;
    }

    try {
      await unfurlVideoLink(event, link.url, slug, config);
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "Could not create Slack video unfurl.",
          slug,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}

async function unfurlVideoLink(
  event: SlackLinkSharedEvent,
  sharedUrl: string,
  slug: string,
  config: {
    appUrl: string;
    botToken: string;
  },
) {
  const [video] = await getDb()
    .select({
      id: videos.id,
      slug: videos.slug,
      title: videos.title,
      recorderName: videos.recorderName,
      status: videos.status,
      thumbnailObjectKey: videos.thumbnailObjectKey,
      processingStage: videos.processingStage,
      processingProgress: videos.processingProgress,
      processingEtaSeconds: videos.processingEtaSeconds,
    })
    .from(videos)
    .where(eq(videos.slug, slug))
    .limit(1);

  if (!video) {
    return;
  }

  const now = new Date();
  const [unfurl] = await getDb()
    .insert(slackUnfurls)
    .values({
      videoId: video.id,
      teamId: event.teamId,
      channelId: event.channelId,
      messageTs: event.messageTs,
      unfurlId: event.unfurlId,
      source: event.source,
      sharedUrl,
      lastAttemptAt: now,
    })
    .onConflictDoUpdate({
      target: [
        slackUnfurls.teamId,
        slackUnfurls.channelId,
        slackUnfurls.messageTs,
        slackUnfurls.sharedUrl,
      ],
      set: {
        unfurlId: event.unfurlId,
        source: event.source,
        lastAttemptAt: now,
        updatedAt: now,
      },
    })
    .returning({ id: slackUnfurls.id });

  if (!unfurl) {
    throw new Error("Could not persist the Slack unfurl target.");
  }

  const target: SlackUnfurlTarget = {
    channelId: event.channelId,
    messageTs: event.messageTs,
    unfurlId: event.unfurlId,
    source: event.source,
    sharedUrl,
  };

  try {
    await chatUnfurl({
      token: config.botToken,
      target,
      content: buildSlackUnfurl(
        {
          slug: video.slug,
          title: video.title,
          recorderName: video.recorderName,
          status: video.status,
          processingStage: video.processingStage,
          progressPercent:
            video.processingProgress === null
              ? null
              : Math.round(
                  Math.min(10_000, Math.max(0, video.processingProgress)) / 100,
                ),
          etaSeconds:
            video.processingEtaSeconds === null
              ? null
              : Math.max(0, video.processingEtaSeconds),
          hasThumbnail: Boolean(video.thumbnailObjectKey),
        },
        sharedUrl,
        config.appUrl,
      ),
    });

    await getDb()
      .update(slackUnfurls)
      .set({
        lastVideoStatus: video.status,
        finalDeliveredAt: video.status === "ready" ? new Date() : null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(slackUnfurls.id, unfurl.id));
  } catch (error) {
    await getDb()
      .update(slackUnfurls)
      .set({
        lastError:
          error instanceof Error
            ? error.message.slice(0, 2_000)
            : "Unknown Slack unfurl failure",
        updatedAt: new Date(),
      })
      .where(eq(slackUnfurls.id, unfurl.id));
    if (video.status === "ready") {
      await dispatchProcessingJob(video.id).catch((dispatchError) => {
        console.error(
          JSON.stringify({
            level: "error",
            message: "Could not dispatch a Slack unfurl retry.",
            videoID: video.id,
            error:
              dispatchError instanceof Error
                ? dispatchError.message
                : String(dispatchError),
          }),
        );
      });
    }
    throw error;
  }
}
