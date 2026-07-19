# Screenly

Screenly is an internal, low-friction screen recorder and sharing service. The
native macOS recorder creates a share link before its upload starts so the link
can be pasted into Slack immediately while the viewer displays a live
processing state.

This repository currently contains the first vertical slice: a Next.js viewer,
Neon data model, and resumable S3-compatible upload API. Open
[`/v/demo1234`](http://localhost:3000/v/demo1234) to view the built-in demo
without configuring external services.

## Architecture

```text
apps/
  web/        Next.js App Router UI and HTTP API
  mac/        Native Swift/SwiftUI recorder (next implementation phase)
  worker/     ffmpeg Cloud Run Job (processing phase)
packages/
  shared/     Cross-application API contracts (added with the recorder)
```

Production is designed around:

- **Cloud Run service:** public Next.js viewer and authenticated upload API
- **Neon:** PostgreSQL metadata
- **S3-compatible storage:** source recordings and processed media
- **Cloud Run Job:** isolated ffmpeg processing, triggered after upload
- **macOS distribution:** signed and notarized universal DMG from the web
  application’s download page

No recording bytes pass through the Next.js service. The API creates a video
record and share slug, then issues short-lived presigned multipart URLs so the
Mac app uploads directly to object storage.

## Local development

Requirements:

- Node.js 22 or newer
- pnpm 11 through Corepack
- A Neon database for upload API development
- Docker, if using the included local MinIO object store

Install dependencies:

```bash
corepack enable
pnpm install
```

Copy the example configuration and replace the Neon connection string:

```bash
cp .env.example apps/web/.env.local
pnpm db:migrate
pnpm dev
```

The application runs at `http://localhost:3000`. MinIO can be started
independently with:

```bash
docker compose up minio minio-init
```

Its S3 endpoint is `http://localhost:9000` and its console is available at
`http://localhost:9001`.

## Upload API

Recorder endpoints require:

```http
Authorization: Bearer <UPLOAD_API_TOKEN>
```

The resumable flow is:

1. `POST /api/uploads` with the file name, MIME type, and byte size.
2. Copy the returned `shareUrl` to the clipboard immediately.
3. `POST /api/uploads/:videoId/parts` with up to 100 part numbers.
4. Upload each part directly to its presigned URL and retain its `ETag`.
5. `POST /api/uploads/:videoId/complete` with all part numbers and ETags.
6. Poll `GET /api/videos/:slug` until its status is `ready` or `failed`.

An active multipart upload can be discarded with
`DELETE /api/uploads/:videoId`. The public viewer is `/v/:slug`.

The temporary shared `UPLOAD_API_TOKEN` will be replaced by hashed, per-user
recorder tokens during the authentication phase.

## Database changes

Drizzle migrations live in `apps/web/drizzle`.

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```

Generate migrations after editing `apps/web/src/db/schema.ts`; apply committed
migrations during deployment before promoting a new application revision.

## Docker

Build and run the complete local container stack:

```bash
docker compose up --build
```

The web image is a non-root, Next.js standalone production image. The Compose
stack includes MinIO for development but intentionally does not emulate Neon.

## Google Cloud Run

Create an Artifact Registry Docker repository named `screenly`, then build and
push the image with Cloud Build:

```bash
gcloud builds submit \
  --config cloudbuild.yaml \
  --substitutions=_IMAGE=us-central1-docker.pkg.dev/PROJECT_ID/screenly/web
```

Deploy the `latest` image as an unauthenticated Cloud Run service so possession
of a share link is sufficient to watch a recording:

```bash
gcloud run deploy screenly-web \
  --image us-central1-docker.pkg.dev/PROJECT_ID/screenly/web:latest \
  --region us-central1 \
  --port 3000 \
  --allow-unauthenticated
```

Store `DATABASE_URL`, `UPLOAD_API_TOKEN`, and object-store credentials in
Google Secret Manager and map them into the service. Configure the remaining
values from `.env.example` as Cloud Run environment variables. The service
health endpoint is `/api/health`.

Video processing will be deployed as a separate Cloud Run Job rather than a
background process inside the web service. Each execution receives one video
ID, runs ffprobe/ffmpeg, writes generated assets to object storage, and updates
Neon. Cloud Run Job retries provide durable failure handling without keeping a
web instance alive.

## macOS distribution

The recorder will be a native Swift/SwiftUI `LSUIElement` application using
ScreenCaptureKit and AVAssetWriter. Its release workflow will:

1. Archive a universal Apple Silicon/Intel build with hardened runtime enabled.
2. Sign the application and installer with Developer ID certificates.
3. Submit the DMG to Apple’s notary service and staple the ticket.
4. Upload the versioned DMG and update manifest to object storage.
5. Expose the latest signed build from `/download`.

Exact `xcodebuild`, signing, and notarization commands will be added alongside
the Xcode project so the documented bundle identifiers and schemes remain
executable rather than placeholders.

## Current verification commands

```bash
pnpm lint
pnpm typecheck
pnpm build
docker compose config
docker build -f apps/web/Dockerfile .
```
