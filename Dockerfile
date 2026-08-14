FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN pnpm install --frozen-lockfile

COPY backend backend
COPY frontend frontend

# Build the frontend (static SPA) and the backend (tsc to dist).
RUN pnpm --filter @event-qa/frontend build \
 && pnpm --filter @event-qa/backend build

# ---------- runtime ----------
FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache su-exec
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

# Install only production dependencies, scoped to the backend workspace.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN pnpm install --frozen-lockfile --prod --filter @event-qa/backend...

COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/frontend/build frontend/build

ENV NODE_ENV=production
ENV EVENT_CONFIG=/data/event.yaml
ENV DB_PATH=/data/event-qa.db
ENV STATIC_DIR=/app/frontend/build
ENV PORT=3000

# Runtime user; entrypoint drops privileges to it after fixing /data
# ownership (needed because /data is normally a host bind mount that
# Docker may auto-create as root).
RUN addgroup -S app && adduser -S app -G app \
 && mkdir -p /data \
 && chown -R app:app /data /app
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3000
VOLUME ["/data"]

ENTRYPOINT ["/docker-entrypoint.sh"]
