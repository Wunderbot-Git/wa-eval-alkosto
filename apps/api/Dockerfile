# Single-stage build (simpler, avoids pnpm symlink issues)
FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

# Copy workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/
COPY tsconfig.base.json ./

# Install all deps
RUN pnpm install --frozen-lockfile

# Build shared
RUN cd packages/shared && pnpm run build

# Generate Prisma client
RUN cd apps/api && npx prisma generate

# Build API
RUN cd apps/api && pnpm run build

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Clean up source files (keep dist, node_modules, prompts, prisma)
RUN rm -rf packages/shared/src apps/api/src tsconfig.base.json

USER nestjs
WORKDIR /app/apps/api

EXPOSE 3001
ENV NODE_ENV=production
ENV API_PORT=3001
# The API binds to loopback by default (local safety); containers must listen
# on all interfaces for Cloud Run health checks and traffic.
ENV API_HOST=0.0.0.0

CMD ["node", "dist/main"]
