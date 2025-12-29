ARG BUN_VERSION=1.3.5

# SSL Certs
FROM alpine:latest as ssl-certs
RUN apk add --no-cache ca-certificates

FROM oven/bun:${BUN_VERSION} AS base
COPY --from=ssl-certs /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

ENV NODE_ENV=production
WORKDIR /app

COPY package.json bun.lock /app/
RUN bun install --production --ignore-scripts --no-cache
COPY src /app/src
COPY drizzle /app/drizzle
COPY drizzle.config.ts /app/

ENV HEALTH_CHECK_PORT=3000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 --start-period=30s \
  CMD bun run src/health-check.ts
CMD ["bun", "src/index.ts"]
