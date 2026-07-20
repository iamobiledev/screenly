import postgres, { type Sql } from "postgres";

import type { WorkerConfig } from "./config.js";

export type VideoJob = {
  id: string;
  slug: string;
  title: string;
  recorderName: string;
  sourceObjectKey: string;
  contentType: string;
  sizeBytes: number;
};

export class VideoRepository {
  private readonly sql: Sql;

  constructor(config: WorkerConfig) {
    this.sql = postgres(config.DATABASE_URL, {
      max: 1,
      ...(config.CLOUD_SQL_INSTANCE
        ? {
            path: `/cloudsql/${config.CLOUD_SQL_INSTANCE}/.s.PGSQL.5432`,
            ssl: false,
          }
        : {}),
    });
  }

  async claim(videoID: string, leaseID: string) {
    const rows = (await this.sql`
      update videos
      set
        status = 'processing',
        processing_error = null,
        processing_lease_id = ${leaseID}::uuid,
        processing_lease_expires_at = now() + interval '2 hours',
        processing_stage = 'downloading',
        processing_progress = 100,
        processing_eta_seconds = null,
        processing_started_at = now(),
        processing_heartbeat_at = now(),
        updated_at = now()
      where id = ${videoID}::uuid
        and status in ('processing', 'failed')
        and (
          processing_lease_id is null
          or processing_lease_expires_at < now()
        )
      returning
        id,
        slug,
        title,
        recorder_name as "recorderName",
        source_object_key as "sourceObjectKey",
        content_type as "contentType",
        size_bytes::double precision as "sizeBytes"
    `) as unknown as VideoJob[];

    return rows[0] ?? null;
  }

  async updateProgress(input: {
    videoID: string;
    leaseID: string;
    stage: string;
    progressBasisPoints: number;
    etaSeconds: number | null;
  }) {
    await this.sql`
      update videos
      set
        processing_stage = ${input.stage},
        processing_progress = ${input.progressBasisPoints},
        processing_eta_seconds = ${input.etaSeconds},
        processing_heartbeat_at = now(),
        updated_at = now()
      where id = ${input.videoID}::uuid
        and processing_lease_id = ${input.leaseID}::uuid
        and status = 'processing'
    `;
  }

  async setDuration(videoID: string, leaseID: string, durationSeconds: number) {
    await this.sql`
      update videos
      set
        duration_seconds = ${Math.round(durationSeconds)},
        processing_heartbeat_at = now(),
        updated_at = now()
      where id = ${videoID}::uuid
        and processing_lease_id = ${leaseID}::uuid
        and status = 'processing'
    `;
  }

  async complete(input: {
    videoID: string;
    leaseID: string;
    playbackObjectKey: string;
    thumbnailObjectKey: string;
    previewObjectKey: string;
    hlsManifestObjectKey: string | null;
    durationSeconds: number;
  }) {
    await this.sql`
      update videos
      set
        status = 'ready',
        playback_object_key = ${input.playbackObjectKey},
        thumbnail_object_key = ${input.thumbnailObjectKey},
        preview_object_key = ${input.previewObjectKey},
        hls_manifest_object_key = ${input.hlsManifestObjectKey},
        duration_seconds = ${Math.round(input.durationSeconds)},
        processing_error = null,
        processing_lease_id = null,
        processing_lease_expires_at = null,
        processing_stage = 'ready',
        processing_progress = 10000,
        processing_eta_seconds = null,
        processing_heartbeat_at = now(),
        ready_at = now(),
        updated_at = now()
      where id = ${input.videoID}::uuid
        and processing_lease_id = ${input.leaseID}::uuid
    `;
  }

  async fail(videoID: string, leaseID: string, error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown processing failure";

    await this.sql`
      update videos
      set
        status = 'failed',
        processing_error = ${message.slice(0, 4_000)},
        processing_lease_id = null,
        processing_lease_expires_at = null,
        processing_stage = 'failed',
        processing_eta_seconds = null,
        processing_heartbeat_at = now(),
        updated_at = now()
      where id = ${videoID}::uuid
        and processing_lease_id = ${leaseID}::uuid
    `;
  }

  async close() {
    await this.sql.end({ timeout: 5 });
  }
}
