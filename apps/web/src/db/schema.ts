import {
  bigint,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const DEFAULT_WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";

export const videoStatus = pgEnum("video_status", [
  "uploading",
  "processing",
  "ready",
  "failed",
]);

export const workspaceRole = pgEnum("workspace_role", [
  "owner",
  "admin",
  "member",
]);

export const invitationEmailStatus = pgEnum("invitation_email_status", [
  "queued",
  "sent",
  "failed",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: varchar("username", { length: 64 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("users_username_unique").on(table.username),
    uniqueIndex("users_email_unique").on(table.email),
  ],
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("workspaces_slug_unique").on(table.slug)],
);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: workspaceRole("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "workspace_members_workspace_user_pk",
      columns: [table.workspaceId, table.userId],
    }),
    index("workspace_members_user_id_index").on(table.userId),
  ],
);

export const userSessions = pgTable(
  "user_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    deviceName: varchar("device_name", { length: 120 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("user_sessions_token_hash_unique").on(table.tokenHash),
    index("user_sessions_user_id_index").on(table.userId),
    index("user_sessions_expires_at_index").on(table.expiresAt),
  ],
);

export const workspaceInvitations = pgTable(
  "workspace_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }).notNull(),
    role: workspaceRole("role").notNull().default("member"),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    invitedByUserId: uuid("invited_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    resendEmailId: text("resend_email_id"),
    emailStatus: invitationEmailStatus("email_status")
      .notNull()
      .default("queued"),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("workspace_invitations_token_hash_unique").on(table.tokenHash),
    index("workspace_invitations_workspace_id_index").on(table.workspaceId),
    index("workspace_invitations_email_index").on(table.email),
  ],
);

export const videos = pgTable(
  "videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    slug: varchar("slug", { length: 16 }).notNull(),
    title: varchar("title", { length: 240 }).notNull(),
    recorderName: varchar("recorder_name", { length: 120 })
      .notNull()
      .default("Screenly user"),
    ownerUserId: uuid("owner_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: videoStatus("status").notNull().default("uploading"),
    sourceObjectKey: text("source_object_key").notNull(),
    playbackObjectKey: text("playback_object_key"),
    thumbnailObjectKey: text("thumbnail_object_key"),
    previewObjectKey: text("preview_object_key"),
    hlsManifestObjectKey: text("hls_manifest_object_key"),
    contentType: varchar("content_type", { length: 120 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    durationSeconds: integer("duration_seconds"),
    multipartUploadId: text("multipart_upload_id"),
    processingError: text("processing_error"),
    processingDispatchedAt: timestamp("processing_dispatched_at", {
      withTimezone: true,
    }),
    processingLeaseId: uuid("processing_lease_id"),
    processingLeaseExpiresAt: timestamp("processing_lease_expires_at", {
      withTimezone: true,
    }),
    processingStage: varchar("processing_stage", { length: 32 }),
    processingProgress: integer("processing_progress"),
    processingEtaSeconds: integer("processing_eta_seconds"),
    processingStartedAt: timestamp("processing_started_at", {
      withTimezone: true,
    }),
    processingHeartbeatAt: timestamp("processing_heartbeat_at", {
      withTimezone: true,
    }),
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
    index("videos_workspace_created_at_index").on(
      table.workspaceId,
      table.createdAt,
    ),
    index("videos_owner_user_id_index").on(table.ownerUserId),
  ],
);

export const videoViews = pgTable(
  "video_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    viewerUserId: uuid("viewer_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    viewerName: varchar("viewer_name", { length: 120 }).notNull(),
    watchCount: integer("watch_count").notNull().default(1),
    firstViewedAt: timestamp("first_viewed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("video_views_video_viewer_unique").on(
      table.videoId,
      table.viewerUserId,
    ),
    index("video_views_video_last_viewed_index").on(
      table.videoId,
      table.lastViewedAt,
    ),
  ],
);

export const slackUnfurls = pgTable(
  "slack_unfurls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    teamId: varchar("team_id", { length: 64 }).notNull(),
    channelId: varchar("channel_id", { length: 64 }).notNull(),
    messageTs: varchar("message_ts", { length: 80 }).notNull(),
    unfurlId: text("unfurl_id"),
    source: varchar("source", { length: 32 }),
    sharedUrl: text("shared_url").notNull(),
    lastVideoStatus: videoStatus("last_video_status"),
    finalDeliveredAt: timestamp("final_delivered_at", {
      withTimezone: true,
    }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("slack_unfurls_target_url_unique").on(
      table.teamId,
      table.channelId,
      table.messageTs,
      table.sharedUrl,
    ),
    index("slack_unfurls_video_pending_index").on(
      table.videoId,
      table.finalDeliveredAt,
    ),
  ],
);

export const recorderTokens = pgTable(
  "recorder_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 120 }).notNull(),
    tokenPrefix: varchar("token_prefix", { length: 20 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("recorder_tokens_hash_unique").on(table.tokenHash),
    index("recorder_tokens_created_at_index").on(table.createdAt),
    index("recorder_tokens_workspace_id_index").on(table.workspaceId),
  ],
);

export type Video = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;
export type WorkspaceRole = (typeof workspaceRole.enumValues)[number];
