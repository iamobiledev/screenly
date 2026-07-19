import {
  bigint,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const videoStatus = pgEnum("video_status", [
  "uploading",
  "processing",
  "ready",
  "failed",
]);

export const videos = pgTable(
  "videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 16 }).notNull(),
    title: varchar("title", { length: 240 }).notNull(),
    recorderName: varchar("recorder_name", { length: 120 })
      .notNull()
      .default("Screenly user"),
    status: videoStatus("status").notNull().default("uploading"),
    sourceObjectKey: text("source_object_key").notNull(),
    playbackObjectKey: text("playback_object_key"),
    thumbnailObjectKey: text("thumbnail_object_key"),
    previewObjectKey: text("preview_object_key"),
    contentType: varchar("content_type", { length: 120 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    durationSeconds: integer("duration_seconds"),
    multipartUploadId: text("multipart_upload_id"),
    processingError: text("processing_error"),
    viewCount: integer("view_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
    readyAt: timestamp("ready_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("videos_slug_unique").on(table.slug),
    index("videos_status_created_at_index").on(table.status, table.createdAt),
  ],
);

export type Video = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;
