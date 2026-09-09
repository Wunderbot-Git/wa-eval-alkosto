# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

**MVP implementation complete** — all 30 prompts from `prompt_plan.md` have been executed. 248 tests passing.

## Tech Stack

- **Monorepo:** pnpm workspaces (`apps/web`, `apps/api`, `packages/shared`)
- **Frontend:** Next.js 15 + TypeScript + Tailwind CSS v4 (App Router)
- **Backend:** NestJS 11 + TypeScript (CommonJS)
- **Database:** PostgreSQL 16 + Prisma 7 (PrismaPg adapter)
- **Async Jobs:** BullMQ + Redis
- **LLM:** Gemini 2.0 Flash (via `@google/genai`) — Vertex AI (`GEMINI_USE_VERTEX=true`) or API key (`GEMINI_API_KEY`); fake judges when neither is set
- **Deployment:** GCP project `autogestion-alkosto` — Cloud Run + Cloud SQL + Memorystore, Terraform in `infra/`, see `DEPLOYMENT.md`
- **Testing:** Vitest (unit), Playwright (E2E)
- **Security:** helmet, @nestjs/throttler, class-validator, pino structured logging

## Commands

```bash
pnpm dev          # run all apps (web :3000, api :3001)
pnpm build        # build all apps
pnpm test         # run all 248 unit tests
pnpm test:e2e     # Playwright E2E tests
pnpm lint         # type-check all packages
pnpm infra:up     # start PostgreSQL + Redis (Docker Compose)
pnpm infra:down   # stop local infra
```

Single-package commands:
```bash
pnpm --filter @eval/api run test       # API tests only
pnpm --filter @eval/web run test       # Web tests only
pnpm --filter @eval/shared run test    # Shared tests only
```

Prisma:
```bash
cd apps/api
npx prisma migrate dev --name <name>   # create migration
npx prisma generate                    # regenerate client
npx prisma db seed                     # seed admin user
```

## Local Setup

1. PostgreSQL 16 running on localhost:5432 (user: `eval`, password: `eval_dev`, db: `eval_dev`)
2. Redis running on localhost:6379
3. Copy `apps/api/.env.example` → `apps/api/.env`
4. Copy `apps/web/.env.example` → `apps/web/.env`
5. `pnpm install && cd apps/api && npx prisma migrate dev && npx prisma db seed`

## Architecture

### Data Flow

```
Upload JSON (array of conversations)
  → ConversationParser validates & normalizes
  → Run created (RUN-YYYYMMDD-{6hex})
  → BullMQ dispatches one job per conversation
      → CatalogService.findByDate (exact match)
      → IntegrityEvaluationService (claims vs. catalog)
      → QualityEvaluationService (3 sub-scores → score 0–10)
      → PatternEvaluationService (taxonomy + emergent)
      → ConsolidatorService (4th LLM call → final label + score)
      → Immutable Snapshot created
  → Run aggregates updated
```

### Four LLM Judges

1. **Integrity** — validates product claims against daily catalog
2. **Quality** — main score (understanding + recommendation + fluency)
3. **Patterns** — taxonomy classification, analytical only
4. **Consolidator** — receives all 3 outputs, decides final score + label

Judges toggle: fake (deterministic) when `GEMINI_API_KEY` unset, real Gemini when set.

### Prompt Files

Stored at `apps/api/prompts/{judge}/system.md` + `user.md`. Loaded by `PromptLoaderService` at startup, cached, SHA-256 versioned in snapshots. Editable without code changes.

### Key Modules (apps/api/src/)

| Module | Purpose |
|---|---|
| `auth/` | Login, sessions (httpOnly cookie + PG), guards, roles |
| `invitations/` | User invite tokens, account activation |
| `users/` | Admin user management (list, deactivate, role change) |
| `catalog/` | Catalog upload, NaN sanitization, date-from-filename |
| `conversations/` | Batch parser, date normalization, conversation API |
| `runs/` | Run CRUD, upload, launch, status, summary |
| `queue/` | BullMQ queue wrapper |
| `pipeline/` | Worker, run launch/cancel |
| `judges/` | Judge interfaces, fakes, Gemini adapters, PromptLoader |
| `evaluation/` | Integrity/Quality/Pattern/Consolidator services |
| `sharing/` | Yalo sharing (run + conversation level) |
| `export/` | JSON export with phone anonymization |
| `retention/` | 3-month auto-cleanup cron |
| `reevaluation/` | Derived run creation from filtered subset |

### Frontend Pages (apps/web/src/app/)

| Route | Purpose |
|---|---|
| `/login` | Email + password login |
| `/dashboard` | Latest run summary, score distribution, progress polling |
| `/runs` | Run history table with pagination |
| `/runs/[id]` | Run detail, conversation table, filters |
| `/runs/[id]/conversations/[id]` | WhatsApp UI + evaluation panel |
| `/admin/users` | User management (admin only) |
| `/admin/invite` | Send invitation (admin only) |
| `/activate` | Set password from invite token |
| `/shared` | Shared content for Yalo readers |

### Key Decisions

- **Roles:** `customer`/`agent` (not user/assistant)
- **message_id/timestamp:** optional (real data doesn't have them)
- **Catalog resolution:** exact date match only
- **Session strategy:** httpOnly cookie + PostgreSQL session table
- **Consolidation:** 4th LLM judge decides final label (not hardcoded rules)
- **Full catalog in context:** sent entirely to Gemini (1M token window)
- **Phone masking:** applied at export time, central 3 digits hidden
- **Re-evaluation:** always uses current prompts, creates new derived run

### Prisma Schema

15 models: User, Session, InviteToken, Run, Conversation, Message, Catalog, CatalogProduct, Evaluation, Finding, Pattern, Snapshot, ShareRecord, ExportJob.

Run `npx prisma generate` after any schema change. Generated client at `apps/api/src/generated/prisma/`.
