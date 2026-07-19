CREATE TYPE "public"."video_status" AS ENUM('uploading', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(16) NOT NULL,
	"title" varchar(240) NOT NULL,
	"recorder_name" varchar(120) DEFAULT 'Screenly user' NOT NULL,
	"status" "video_status" DEFAULT 'uploading' NOT NULL,
	"source_object_key" text NOT NULL,
	"playback_object_key" text,
	"thumbnail_object_key" text,
	"preview_object_key" text,
	"content_type" varchar(120) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"duration_seconds" integer,
	"multipart_upload_id" text,
	"processing_error" text,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_at" timestamp with time zone,
	"ready_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "videos_slug_unique" ON "videos" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "videos_status_created_at_index" ON "videos" USING btree ("status","created_at");