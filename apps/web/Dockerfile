# Single-stage build (matches API pattern, avoids pnpm symlink issues)
FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

# Copy workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/ ./packages/shared/
COPY apps/web/ ./apps/web/
COPY tsconfig.base.json ./

# Install all deps
RUN pnpm install --frozen-lockfile

# Build shared
RUN cd packages/shared && pnpm run build

# Build Next.js (API calls go through same-origin /api rewrite)
ENV NEXT_TELEMETRY_DISABLED=1
ARG BACKEND_URL=https://eval-api-545953473121.us-central1.run.app
ENV BACKEND_URL=$BACKEND_URL
RUN cd apps/web && pnpm run build

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Clean up source (keep .next, node_modules, public)
RUN rm -rf packages/shared/src apps/web/src tsconfig.base.json

USER nextjs
WORKDIR /app/apps/web

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node_modules/.bin/next", "start", "-p", "3000"]
