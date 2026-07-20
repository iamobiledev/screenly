# Screenly

Screenly is an internal, low-friction screen recorder and sharing service. The
native macOS recorder creates a share link before its upload starts so the link
can be pasted into Slack immediately while the viewer displays a live
processing state.

The repository contains the complete application foundation: the web product,
native recorder, resumable upload path, and ffmpeg processing job. Open
[`/v/demo1234`](http://localhost:3000/v/demo1234) to view the built-in demo
without configuring external services.

## Architecture

```text
apps/
  web/        Next.js App Router UI and HTTP API
  mac/        Native Swift/SwiftUI menu bar recorder
  worker/     TypeScript ffmpeg Cloud Run Job
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

The recorder writes microphone and system audio as separate source tracks.
The processing job mixes them into one AAC track for consistent browser
playback.

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
pnpm user:bootstrap
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

Recorder endpoints require a per-recorder token created from
`/library/tokens`:

```http
Authorization: Bearer <RECORDER_TOKEN>
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

Only SHA-256 token hashes are stored in Neon. Tokens can be independently
revoked without affecting uploaded recordings. `UPLOAD_API_TOKEN` remains as
an optional bootstrap/recovery credential and should not be installed on team
devices.

## Users and workspaces

Browser and native-device access use individual username/password accounts.
There is no open signup: owners and admins invite users from
`/library/members`, and invitees create an account (or authenticate their
existing account) from the emailed link. Usernames and email addresses are
stored normalized to lowercase. Passwords use Node.js scrypt, browser cookies
are HMAC-signed, and native device sessions store only SHA-256 token hashes.

After applying migrations, bootstrap the first owner and fixed default
workspace:

```bash
export OWNER_USERNAME=admin
export OWNER_EMAIL=admin@example.com
export OWNER_PASSWORD='at-least-12-characters'
export WORKSPACE_NAME='Screenly'
pnpm user:bootstrap
```

The bootstrap command is idempotent and never prints the password. Configure
`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `APP_URL` to deliver invitation
emails. If Resend is not configured, invitation creation still returns a
copyable `inviteUrl` and records failed delivery.

Native clients sign in with `POST /api/auth/device/session` using
`username`, `password`, and `deviceName`. The response contains
`sessionToken`, `sessionExpiresAt`, `user`, `workspaces`, `activeWorkspace`,
and a one-time `recorderToken` object. A bearer user-session token can read the
current `user` and `workspaces` with `GET` on the same route or revoke itself
with `DELETE`. `POST /api/auth/device/workspace` accepts `workspaceId` and
`deviceName`, then returns `activeWorkspace` and a newly minted
workspace-scoped `recorderToken`.

## Database changes

Drizzle migrations live in `apps/web/drizzle`.

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```

Generate migrations after editing `apps/web/src/db/schema.ts`; apply committed
migrations during deployment before promoting a new application revision.
The multi-workspace migration creates the fixed default workspace
`00000000-0000-4000-8000-000000000001`, backfills every existing video and
recorder token to it, and only then makes both workspace columns non-null.
Video IDs, slugs, and object keys are unchanged.

## Docker

Build and run the complete local container stack:

```bash
docker compose up --build
```

The web image is a non-root, Next.js standalone production image. The Compose
stack includes MinIO for development but intentionally does not emulate Neon.

To process one uploaded video locally, install ffmpeg or run the worker profile:

```bash
VIDEO_ID=<database-video-uuid> docker compose --profile processor run --rm worker
```

## Google Cloud Run

Create an Artifact Registry Docker repository named `screenly`, then build and
push both images with Cloud Build:

```bash
gcloud builds submit \
  --config cloudbuild.yaml \
  --substitutions=_WEB_IMAGE=us-central1-docker.pkg.dev/PROJECT_ID/screenly/web,_WORKER_IMAGE=us-central1-docker.pkg.dev/PROJECT_ID/screenly/worker
```

Create the processor job first. Map `DATABASE_URL` and S3 credentials from
Secret Manager in a real deployment:

```bash
gcloud run jobs deploy screenly-processor \
  --image us-central1-docker.pkg.dev/PROJECT_ID/screenly/worker:latest \
  --region us-central1 \
  --tasks 1 \
  --max-retries 3 \
  --task-timeout 3600s \
  --set-env-vars S3_REGION=us-east-1,S3_BUCKET=screenly,HLS_THRESHOLD_SECONDS=1200
```

Deploy the web image as an unauthenticated service so possession of a share
link is sufficient to watch a recording:

```bash
gcloud run deploy screenly-web \
  --image us-central1-docker.pkg.dev/PROJECT_ID/screenly/web:latest \
  --region us-central1 \
  --port 3000 \
  --allow-unauthenticated \
  --set-env-vars PROCESSOR_MODE=cloud-run-job,GCP_PROJECT_ID=PROJECT_ID,GCP_REGION=us-central1,GCP_PROCESSOR_JOB=screenly-processor
```

Grant the web service account permission to execute the private job:

```bash
gcloud run jobs add-iam-policy-binding screenly-processor \
  --region us-central1 \
  --member serviceAccount:SCREENLY_WEB_SERVICE_ACCOUNT \
  --role roles/run.jobsExecutorWithOverrides
```

Store `DATABASE_URL`, `SESSION_SECRET`, optional `UPLOAD_API_TOKEN`,
`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and object-store credentials in Google
Secret Manager. Apply the committed Drizzle migrations and run
`pnpm user:bootstrap` with owner variables before routing traffic to the new
schema-dependent revision. `UPLOAD_API_TOKEN` is restricted to the fixed
default workspace. The service health endpoint is `/api/health`.

Each job receives one `VIDEO_ID` override from the web service. A database
lease prevents duplicate Cloud Run executions from processing the same video.
The job probes compatibility, mixes audio when needed, creates MP4, thumbnail,
animated preview and optional HLS assets, then atomically marks the video
ready.

## macOS build and distribution

The recorder targets macOS 15 and requires Xcode 16.3 or newer. Generate the
Xcode project from the committed specification:

```bash
brew install xcodegen
cd apps/mac
xcodegen generate
xcodebuild \
  -project Screenly.xcodeproj \
  -scheme Screenly \
  -configuration Debug \
  build
```

Set the signing team in Xcode for development. The production release script
archives with hardened runtime, creates and signs a DMG, submits it to Apple,
waits for notarization, staples the ticket, validates it, and emits a SHA-256
file:

```bash
export APPLE_ID=builds@example.com
export APPLE_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=ABCDE12345
export MAC_APP_VERSION=1.0.0
export MAC_BUILD_NUMBER=1
bash apps/mac/scripts/build-release.sh
```

For internal testing without Apple credentials, push an `internal-v*` tag such
as `internal-v0.1.0`. The workflow creates an ad-hoc-signed DMG and preserves it
as a GitHub Actions artifact without publishing it to the configured release
bucket. Gatekeeper does not trust ad-hoc signatures, so users must explicitly
approve the app with **Control-click → Open**. Use the notarized workflow above
before distributing outside the team.

The `Release macOS recorder` GitHub Actions workflow additionally imports the
Developer ID certificate and publishes versioned and `Screenly-latest.dmg`
objects to S3-compatible storage. Configure these secrets:

- `APPLE_ID`, `APPLE_APP_PASSWORD`, `APPLE_TEAM_ID`
- `MACOS_CERTIFICATE_P12_BASE64`, `MACOS_CERTIFICATE_PASSWORD`
- `MAC_RELEASE_S3_ACCESS_KEY_ID`, `MAC_RELEASE_S3_SECRET_ACCESS_KEY`

Configure repository variables `MAC_RELEASE_S3_URI`,
`MAC_RELEASE_S3_REGION`, and optional `MAC_RELEASE_S3_ENDPOINT`. Finally set
`MAC_APP_DOWNLOAD_URL`, `MAC_APP_VERSION`, and `MAC_APP_SHA256` on the web
service. `/download` and `/api/releases/macos/latest` then expose the signed
build.

## Current verification commands

```bash
pnpm lint
pnpm typecheck
pnpm build
docker compose config
docker build -f apps/web/Dockerfile .
docker build -f apps/worker/Dockerfile .
# On macOS:
xcodebuild -project apps/mac/Screenly.xcodeproj -scheme Screenly build
```
