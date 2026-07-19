CREATE TABLE "recorder_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"token_prefix" varchar(20) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "recorder_tokens_hash_unique" ON "recorder_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "recorder_tokens_created_at_index" ON "recorder_tokens" USING btree ("created_at");