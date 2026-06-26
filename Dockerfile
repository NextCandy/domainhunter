# syntax=docker/dockerfile:1.7

# ---------- builder ----------
FROM oven/bun:1.1-alpine AS builder
WORKDIR /app

# Build target: node-server (Nitro) so the output runs on plain Node on Synology
ENV NITRO_PRESET=node-server \
    NODE_ENV=production

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# ---------- runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# Nitro node-server preset emits a self-contained .output directory
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/db ./db

# Non-root
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1

CMD ["node", ".output/server/index.mjs"]
