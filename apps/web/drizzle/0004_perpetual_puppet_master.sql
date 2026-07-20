CREATE TABLE "slack_unfurls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"team_id" varchar(64) NOT NULL,
	"channel_id" varchar(64) NOT NULL,
	"message_ts" varchar(80) NOT NULL,
	"unfurl_id" text,
	"source" varchar(32),
	"shared_url" text NOT NULL,
	"last_video_status" "video_status",
	"final_delivered_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "processing_stage" varchar(32);--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "processing_progress" integer;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "processing_eta_seconds" integer;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "processing_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "processing_heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "slack_unfurls" ADD CONSTRAINT "slack_unfurls_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "slack_unfurls_target_url_unique" ON "slack_unfurls" USING btree ("team_id","channel_id","message_ts","shared_url");--> statement-breakpoint
CREATE INDEX "slack_unfurls_video_pending_index" ON "slack_unfurls" USING btree ("video_id","final_delivered_at");