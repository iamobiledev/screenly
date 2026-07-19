ALTER TABLE "videos" ADD COLUMN "hls_manifest_object_key" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "processing_dispatched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "processing_lease_id" uuid;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "processing_lease_expires_at" timestamp with time zone;