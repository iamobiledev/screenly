# Screenly

Screenly is an internal screen recorder and sharing service. This is a pnpm
workspace monorepo. See `README.md` for the full product and deployment docs.

```
apps/
  web/      Next.js 16 (App Router) UI + HTTP API   (@screenly/web)
  worker/   TypeScript ffmpeg Cloud Run Job          (@screenly/worker)
  mac/      Native Swift/SwiftUI menu bar recorder
```

## Cursor Cloud specific instructions

Standard commands live in the root `package.json` and `README.md`; prefer those.
The notes below are the non-obvious things for this Linux cloud environment.

### Scope on this VM

- `apps/web` and `apps/worker` are the runnable, testable products here.
- `apps/mac` is Swift/Xcode and **cannot be built on Linux** (needs macOS +
  Xcode 16.3). It is out of scope for this environment.

### Running the web app

- Create `apps/web/.env.local` (copy `.env.example`) before running anything —
  `pnpm dev` and the `db:*` scripts read it. This file is gitignored and is not
  committed by the setup agent, so recreate it if it is missing.
- `pnpm dev` runs the Next.js dev server on `http://localhost:3000`.
- `pnpm lint`, `pnpm typecheck`, and `pnpm build` all pass without any external
  services (no DB/S3 needed) — they only need dependencies installed.

### Database: runtime requires a real Neon endpoint (important gotcha)

- The runtime DB client (`apps/web/src/db/index.ts`) uses
  `drizzle-orm/neon-http` + `@neondatabase/serverless`. Its default endpoint
  rewrites the connection host to `https://api.<host>/sql`, so it **only works
  against a real Neon HTTP endpoint**. A plain local Postgres will NOT work at
  runtime, and there is no code path to repoint it without editing code.
- `DATABASE_URL` is provided as an injected environment secret (a real Neon
  endpoint). Because it is a real env var, it takes precedence over anything in
  `apps/web/.env.local` (Next.js and dotenv do not override existing env vars),
  so leave `DATABASE_URL` unset in `.env.local`.
- The dev server only picks up the secret if it is running in the process
  environment. If `pnpm dev` was started before the secret existed, restart it
  (e.g. `export DATABASE_URL=...` then `pnpm dev`) or the DB-backed pages error.
- Run `pnpm db:migrate` once against the Neon DB to create the `videos` and
  `recorder_tokens` tables before using DB-backed flows.
- These flows need the DB: `/library`, `/library/tokens`, and the upload API
  (`/api/uploads/*`, `/api/videos/[slug]` for non-demo slugs). With the secret
  applied and migrations run, they work end to end (verified: login → create
  recorder token → resumable upload → worker processing → playback).
- `pnpm db:migrate` / `db:generate` use drizzle-kit's own driver, which for a
  Neon URL still connects over the Neon serverless protocol.

### What works without any external services

- Public viewer `/v/demo1234` (renders the viewer UI + view-count stub).
- Workspace login: `POST /api/auth/session` with `WORKSPACE_PASSWORD` returns a
  signed session cookie (`/login` page). No DB involved.
- Landing `/` and macOS `/download` pages (the latter reads `MAC_APP_*` env).
- Note: the built-in demo video points at an external Google sample bucket
  (`storage.googleapis.com/gtv-videos-bucket/...`) that now returns HTTP 403
  globally, so the demo video **bytes will not play** even though the viewer UI
  renders correctly. This is an external-asset limitation, not a setup defect.

### Object storage (S3) and the worker

- The upload/playback flows need an S3-compatible store. The README uses
  `docker compose up minio minio-init`, but **Docker is NOT preinstalled** on
  this VM. A working alternative is the standalone MinIO server + `mc` client
  binaries (from dl.min.io): run `minio server <datadir> --console-address :9001`
  with `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` set to the `S3_ACCESS_KEY_ID` /
  `S3_SECRET_ACCESS_KEY` from `.env.local`, then create the `screenly` bucket
  (`mc mb local/screenly`). Endpoint is `http://localhost:9000`.
- Because storage is served from local MinIO (`localhost:9000`), uploaded
  recordings actually play in-browser. The built-in `/v/demo1234` sample is the
  only asset that won't play (its external bucket 403s).
- `PROCESSOR_MODE=manual` (the local default) means completing an upload does
  NOT auto-dispatch processing; run the worker manually.
- `apps/worker` is an ffmpeg processing job (ffmpeg is preinstalled). Run it as
  `DATABASE_URL=... VIDEO_ID=<uuid> S3_ENDPOINT=http://localhost:9000
  S3_FORCE_PATH_STYLE=true S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=...
  S3_BUCKET=screenly node apps/worker/dist/index.js` (after `pnpm build`). It
  claims the video by `VIDEO_ID`, transcodes if needed, generates a thumbnail +
  animated preview, and marks the video `ready`.
