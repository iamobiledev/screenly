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
- Consequently these need a real Neon `DATABASE_URL`: `/library`,
  `/library/tokens`, and the upload API (`/api/uploads/*`, `/api/videos/[slug]`
  for non-demo slugs). Hitting them with a placeholder URL throws a
  `NeonDbError: fetch failed` Next.js runtime error — this is expected, not a bug.
- `pnpm db:migrate` / `db:generate` use drizzle-kit's own TCP Postgres driver,
  so migrations can target a plain Postgres, but that does not make the runtime
  app usable (runtime still uses neon-http).

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

- S3 is provided locally by MinIO via `docker compose up minio minio-init`
  (Docker is NOT preinstalled on this VM). Endpoint `http://localhost:9000`,
  console `http://localhost:9001`.
- `apps/worker` is an ffmpeg processing job (ffmpeg is preinstalled). It reads a
  single `VIDEO_ID` and needs both a real `DATABASE_URL` and S3 to do useful
  work; see README "Docker" and "worker profile" sections.
