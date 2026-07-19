import { neon } from "@neondatabase/serverless";
export class VideoRepository {
    sql;
    constructor(config) {
        this.sql = neon(config.DATABASE_URL);
    }
    async claim(videoID, leaseID) {
        const rows = (await this.sql `
      update videos
      set
        status = 'processing',
        processing_error = null,
        processing_lease_id = ${leaseID}::uuid,
        processing_lease_expires_at = now() + interval '2 hours',
        updated_at = now()
      where id = ${videoID}::uuid
        and status in ('processing', 'failed')
        and (
          processing_lease_id is null
          or processing_lease_expires_at < now()
        )
      returning
        id,
        source_object_key as "sourceObjectKey",
        content_type as "contentType"
    `);
        return rows[0] ?? null;
    }
    async complete(input) {
        await this.sql `
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
        ready_at = now(),
        updated_at = now()
      where id = ${input.videoID}::uuid
        and processing_lease_id = ${input.leaseID}::uuid
    `;
    }
    async fail(videoID, leaseID, error) {
        const message = error instanceof Error ? error.message : "Unknown processing failure";
        await this.sql `
      update videos
      set
        status = 'failed',
        processing_error = ${message.slice(0, 4_000)},
        processing_lease_id = null,
        processing_lease_expires_at = null,
        updated_at = now()
      where id = ${videoID}::uuid
        and processing_lease_id = ${leaseID}::uuid
    `;
    }
}
