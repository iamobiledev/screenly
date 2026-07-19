FROM node:22-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

FROM base AS dependencies

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker/package.json apps/worker/package.json

RUN pnpm install --frozen-lockfile --filter @screenly/worker...

FROM dependencies AS builder

COPY apps/worker apps/worker

RUN pnpm --filter @screenly/worker build

FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=builder /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist

USER node

WORKDIR /app/apps/worker

CMD ["node", "dist/index.js"]
