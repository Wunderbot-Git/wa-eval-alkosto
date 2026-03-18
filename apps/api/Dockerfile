# Stage 1: Install dependencies
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile

# Stage 2: Build
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules

COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY tsconfig.base.json ./

# Build shared package
RUN cd packages/shared && pnpm run build

# Generate Prisma client
RUN cd apps/api && npx prisma generate

# Build API
RUN cd apps/api && pnpm run build

# Stage 3: Production
FROM node:22-alpine AS run
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/node_modules ./node_modules
COPY --from=build /app/apps/api/prisma ./prisma
COPY --from=build /app/apps/api/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/apps/api/prompts ./prompts
COPY --from=build /app/apps/api/package.json ./package.json
COPY --from=build /app/apps/api/src/generated ./src/generated
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json

USER nestjs

EXPOSE 3001
ENV NODE_ENV=production
ENV API_PORT=3001

CMD ["node", "dist/main"]
