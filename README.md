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
- **Cloud SQL for PostgreSQL:** video metadata, tokens, and processing leases
- **Cloud Storage:** source recordings and processed media
- **Cloud Run Job:** isolated ffmpeg processing, triggered after upload
- **macOS distribution:** signed and notarized universal DMG from the web
  application’s download page

No recording bytes pass through the Next.js service. The API creates a video
record and share slug, then issues short-lived presigned multipart URLs so the
Mac app uploads directly to Cloud Storage. The storage integration uses Cloud
Storage's S3-compatible XML API and HMAC credentials, preserving the recorder's
resumable multipart protocol.

The recorder writes microphone and system audio as separate source tracks.
The processing job mixes them into one AAC track for consistent browser
playback.

## Local development

Requirements:

- Node.js 22 or newer
- pnpm 11 through Corepack
- PostgreSQL or a Cloud SQL instance reached through the Cloud SQL Auth Proxy
- Docker, if using the included local MinIO object store

Install dependencies:

```bash
corepack enable
pnpm install
```

Copy the example configuration and replace the PostgreSQL connection string:

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

Only SHA-256 token hashes are stored in PostgreSQL. Tokens can be independently
revoked without affecting uploaded recordings. `UPLOAD_API_TOKEN` remains as
an optional bootstrap/recovery credential and should not be installed on team
devices.

## Processing progress

After upload, the processor reports its current phase, percentage, heartbeat,
and estimated time remaining to the video record. Transfer estimates use
observed byte throughput, while ffmpeg estimates use the recording timestamp
and live encoding speed. The public viewer polls these measurements and updates
automatically.

The viewer intentionally says **Queued**, **Estimating time**, or **Processor
update delayed** when it does not have enough current data. It does not invent
an ETA before the worker has measured the recording. Existing videos and jobs
created before the progress migration continue to use these fallback states.

## Slack inline playback

Slack only renders inline video from custom providers through an installed
Slack app; Open Graph video tags alone produce a static preview. Screenly's
Slack app listens for `link_shared` events and responds with a Block Kit video
unfurl. Links pasted while a recording is uploading or processing first show a
status card, then update in place when the worker marks the video ready.

This internal deployment uses one environment-configured Slack installation:

1. Copy `slack-app-manifest.example.yml` and replace every
   `screenly.example.com` value with the HTTPS hostname in `APP_URL`.
2. Create a Slack app **from an app manifest**. Copy its signing secret to the
   web service as `SLACK_SIGNING_SECRET`; URL verification only needs this
   secret and can run before the app is installed.
3. Confirm Slack verifies
   `https://YOUR_HOST/api/integrations/slack/events` as the Events API request
   URL.
4. Install the app to the workspace, approve `links:read`, `links:write`, and
   `links.embed:write`, then store the installed bot token as
   `SLACK_BOT_TOKEN` on both the web service and processor job.

The unfurl player is `/embed/v/:slug`. It deliberately contains only the video
player and must remain iframe-compatible: do not add `X-Frame-Options` or a
`frame-ancestors` policy that excludes Slack. If links stay collapsed, confirm
the app is installed, the exact share hostname is in **App Unfurl Domains**, and
the workspace administrator has not blocked previews for that hostname.

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

Every member signs in at `/login` (the home, download, and viewer pages all
link to it) to browse the workspace library, rename or delete recordings, and
see who watched each one. Videos uploaded through a signed-in recorder are
attributed to that user, which powers the library's "My recordings" filter.

## Watch analytics

Each `/v/:slug` playback increments the video's total view count. When the
viewer also has a Screenly session cookie, the view is recorded in the
`video_views` table (one row per user per video with a watch count and
last-viewed timestamp). Members can open the view counter on any library card
to see named viewers; signed-out plays are shown as anonymous views, and no
viewer identity is collected from people without an account.
`GET /api/library/videos/:videoId/views` returns
`{ viewCount, viewers: [{ viewerName, watchCount, lastViewedAt }] }` for
members of the video's workspace.

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
stack includes PostgreSQL and MinIO for development. On a new PostgreSQL volume,
the committed migrations run in file-name order during database initialization.

To process one uploaded video locally, install ffmpeg or run the worker profile:

```bash
VIDEO_ID=<database-video-uuid> docker compose --profile processor run --rm worker
```

## Google Cloud

The production runtime uses Cloud Run, Cloud SQL for PostgreSQL, Cloud Storage,
Artifact Registry, Secret Manager, and a Cloud Run Job. Enable their APIs:

```bash
gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com
```

Create an Artifact Registry Docker repository named `screenly`, then build and
push both images with Cloud Build:

```bash
gcloud artifacts repositories create screenly \
  --repository-format docker \
  --location us-central1

gcloud builds submit \
  --config cloudbuild.yaml \
  --substitutions=_WEB_IMAGE=us-central1-docker.pkg.dev/PROJECT_ID/screenly/web,_WORKER_IMAGE=us-central1-docker.pkg.dev/PROJECT_ID/screenly/worker
```

Create a Cloud SQL for PostgreSQL instance, database, and password-based
application user. `DATABASE_URL` carries the database name and credentials;
`CLOUD_SQL_INSTANCE` makes the app replace its URL host with Cloud Run's Unix
socket. URL-encode the password before placing it in the URL.

Create a private Cloud Storage bucket with uniform bucket-level access. The
recorder's direct multipart uploads use the Cloud Storage XML API, so create an
HMAC key for a dedicated storage service account with
`roles/storage.objectAdmin` on only that bucket. Store the HMAC access ID and
secret in Secret Manager as `storage-access-key-id` and
`storage-secret-access-key`. HMAC credentials are required for the current
presigned multipart protocol; Cloud Run's attached identity alone cannot sign
those S3-compatible requests.

Create separate runtime service accounts for the web service and processor job.
Grant both `roles/cloudsql.client`; grant the web identity
`roles/run.jobsExecutorWithOverrides` on the processor job. Give both identities
Secret Manager access only to the secrets they consume.

Create the processor job first:

```bash
gcloud run jobs deploy screenly-processor \
  --image us-central1-docker.pkg.dev/PROJECT_ID/screenly/worker:latest \
  --region us-central1 \
  --service-account screenly-processor@PROJECT_ID.iam.gserviceaccount.com \
  --set-cloudsql-instances PROJECT_ID:us-central1:screenly \
  --tasks 1 \
  --max-retries 3 \
  --task-timeout 3600s \
  --set-env-vars APP_URL=https://screenly.example.com,CLOUD_SQL_INSTANCE=PROJECT_ID:us-central1:screenly,STORAGE_BACKEND=gcs,STORAGE_BUCKET=BUCKET_NAME,HLS_THRESHOLD_SECONDS=1200 \
  --set-secrets DATABASE_URL=database-url:latest,STORAGE_ACCESS_KEY_ID=storage-access-key-id:latest,STORAGE_SECRET_ACCESS_KEY=storage-secret-access-key:latest,SLACK_BOT_TOKEN=slack-bot-token:latest
```

Deploy the web image as an unauthenticated service so possession of a share
link is sufficient to watch a recording:

```bash
gcloud run deploy screenly-web \
  --image us-central1-docker.pkg.dev/PROJECT_ID/screenly/web:latest \
  --region us-central1 \
  --port 3000 \
  --service-account screenly-web@PROJECT_ID.iam.gserviceaccount.com \
  --set-cloudsql-instances PROJECT_ID:us-central1:screenly \
  --allow-unauthenticated \
  --set-env-vars APP_URL=https://screenly.example.com,PROCESSOR_MODE=cloud-run-job,GCP_PROJECT_ID=PROJECT_ID,GCP_REGION=us-central1,GCP_PROCESSOR_JOB=screenly-processor,CLOUD_SQL_INSTANCE=PROJECT_ID:us-central1:screenly,STORAGE_BACKEND=gcs,STORAGE_BUCKET=BUCKET_NAME \
  --set-secrets DATABASE_URL=database-url:latest,SESSION_SECRET=session-secret:latest,STORAGE_ACCESS_KEY_ID=storage-access-key-id:latest,STORAGE_SECRET_ACCESS_KEY=storage-secret-access-key:latest,SLACK_BOT_TOKEN=slack-bot-token:latest,SLACK_SIGNING_SECRET=slack-signing-secret:latest
```

Grant the web service account permission to execute the private job:

```bash
gcloud run jobs add-iam-policy-binding screenly-processor \
  --region us-central1 \
  --member serviceAccount:screenly-web@PROJECT_ID.iam.gserviceaccount.com \
  --role roles/run.jobsExecutorWithOverrides
```

Store `DATABASE_URL`, `SESSION_SECRET`, the optional bootstrap
`UPLOAD_API_TOKEN`, `RESEND_API_KEY`, Slack bot token/signing secret, and HMAC
credentials in Secret Manager.
Set `RESEND_FROM_EMAIL` to a verified sender. Apply the committed Drizzle
migrations through the Cloud SQL Auth Proxy and bootstrap the first owner before
routing traffic to a schema-dependent revision:

```bash
cloud-sql-proxy PROJECT_ID:us-central1:screenly --port 5432
export DATABASE_URL='postgresql://screenly:PASSWORD@127.0.0.1:5432/screenly'
pnpm db:migrate
OWNER_USERNAME=admin \
OWNER_EMAIL=admin@example.com \
OWNER_PASSWORD='at-least-12-characters' \
WORKSPACE_NAME=Screenly \
pnpm user:bootstrap
```

The service health endpoint is `/api/health`. Set
`DATABASE_MAX_CONNECTIONS` conservatively per Cloud Run instance (the default
is 5); the processor job always uses one connection.

Each job receives one `VIDEO_ID` override from the web service. A database
lease prevents duplicate Cloud Run executions from processing the same video.
The job probes compatibility, mixes audio when needed, creates MP4, thumbnail,
animated preview and optional HLS assets, then atomically marks the video
ready.

## Continuous deployment

The `Deploy to production` workflow (`.github/workflows/deploy.yml`) runs on
every push to `main`. It first verifies the change (`pnpm test`, `lint`,
`typecheck`, `build`), then builds and pushes both Docker images to Artifact
Registry, optionally applies Drizzle migrations through the Cloud SQL Auth
Proxy, deploys the new web image to the Cloud Run service (all existing
environment variables, secrets, and flags are preserved), updates the
processor job image, and finally checks `/api/health`.

Authentication is keyless through Workload Identity Federation. One-time
setup:

```bash
gcloud iam service-accounts create screenly-deployer

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member serviceAccount:screenly-deployer@PROJECT_ID.iam.gserviceaccount.com \
  --role roles/run.admin
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member serviceAccount:screenly-deployer@PROJECT_ID.iam.gserviceaccount.com \
  --role roles/artifactregistry.writer
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member serviceAccount:screenly-deployer@PROJECT_ID.iam.gserviceaccount.com \
  --role roles/cloudsql.client
gcloud iam service-accounts add-iam-policy-binding \
  screenly-web@PROJECT_ID.iam.gserviceaccount.com \
  --member serviceAccount:screenly-deployer@PROJECT_ID.iam.gserviceaccount.com \
  --role roles/iam.serviceAccountUser

gcloud iam workload-identity-pools create github \
  --location global
gcloud iam workload-identity-pools providers create-oidc github-actions \
  --location global \
  --workload-identity-pool github \
  --issuer-uri https://token.actions.githubusercontent.com \
  --attribute-mapping google.subject=assertion.sub,attribute.repository=assertion.repository \
  --attribute-condition "assertion.repository == 'OWNER/screenly'"
gcloud iam service-accounts add-iam-policy-binding \
  screenly-deployer@PROJECT_ID.iam.gserviceaccount.com \
  --member "principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/OWNER/screenly" \
  --role roles/iam.workloadIdentityUser
```

Then configure these GitHub repository **variables**: `GCP_PROJECT_ID`,
`GCP_REGION` (for example `us-central1`),
`GCP_WORKLOAD_IDENTITY_PROVIDER`
(`projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github-actions`),
`GCP_DEPLOY_SERVICE_ACCOUNT`
(`screenly-deployer@PROJECT_ID.iam.gserviceaccount.com`), and
`CLOUD_SQL_INSTANCE` (`PROJECT_ID:us-central1:screenly`).
`CLOUD_RUN_SERVICE` and `CLOUD_RUN_JOB` are optional overrides for the
default `screenly-web` and `screenly-processor` names. Add the repository
**secret** `DATABASE_URL` (a `127.0.0.1:5432` connection string, reached
through the proxy) to enable the automatic migration step; without it,
migrations are skipped and must be applied manually as described above.

The deploy job is skipped entirely until `GCP_PROJECT_ID` is configured, so
the workflow stays green on forks.

## macOS build and distribution

The recorder targets macOS 15 and requires Xcode 16.3 or newer. Building with
the Xcode 26 SDK (macOS 26 Tahoe) additionally enables the native Liquid Glass
appearance; on macOS 15, and in builds from older SDKs, the interface falls
back to standard translucent materials. The release workflow runs on
`macos-26` runners so published builds always include the glass appearance.
Generate the Xcode project from the committed specification:

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
objects to S3-compatible storage, including Cloud Storage's XML API. Configure
these secrets:

- `APPLE_ID`, `APPLE_APP_PASSWORD`, `APPLE_TEAM_ID`
- `MACOS_CERTIFICATE_P12_BASE64`, `MACOS_CERTIFICATE_PASSWORD`
- `MAC_RELEASE_STORAGE_ACCESS_KEY_ID`, `MAC_RELEASE_STORAGE_SECRET_ACCESS_KEY`

Configure repository variables `MAC_RELEASE_STORAGE_URI`,
`MAC_RELEASE_STORAGE_REGION`, and optional `MAC_RELEASE_STORAGE_ENDPOINT`.
For Cloud Storage use an `s3://BUCKET/releases` URI, region `auto`, and endpoint
`https://storage.googleapis.com`. Finally set `MAC_APP_DOWNLOAD_URL`,
`MAC_APP_VERSION`, and `MAC_APP_SHA256` on the web service. `/download` and
`/api/releases/macos/latest` then expose the signed build.

## Current verification commands

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
docker compose config
docker build -f apps/web/Dockerfile .
docker build -f apps/worker/Dockerfile .
# On macOS:
xcodebuild -project apps/mac/Screenly.xcodeproj -scheme Screenly build
```
