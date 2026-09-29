# Multi-stage build producing a minimal Next.js "standalone" image.
FROM node:20-alpine AS base

# --- Install dependencies ---------------------------------------------------
FROM base AS deps
# See https://github.com/nodejs/docker-node#nodealpine for why libc6-compat may be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# --- Build ------------------------------------------------------------------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# --- Runtime ----------------------------------------------------------------
FROM base AS runner
WORKDIR /app

# Install postgresql-client for pg_dump backups
RUN apk add --no-cache postgresql-client libc6-compat

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Writable prerender cache, uploads, and backups directories
RUN mkdir -p .next public/uploads backups
RUN chown -R nextjs:nodejs .next public/uploads backups

# Output-traced server bundle plus static assets
# https://nextjs.org/docs/app/api-reference/next-config-js/output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
