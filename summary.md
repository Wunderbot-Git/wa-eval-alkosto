# Project Summary — WA Eval System Alkosto

## What Is This?

A web-based evaluation system for real WhatsApp sales conversations from Yalo's agent for Alkosto (Colombian electronics retailer). The system uses LLM judges (Gemini 2.0 Flash) to assess conversation quality and integrity against daily product catalogs.

## Current State

**MVP complete.** All 30 implementation prompts executed. The system is functional end-to-end with fake judges for local development and Gemini integration ready when an API key is provided.

| Metric | Value |
|---|---|
| Unit tests | 248 passing |
| Test files | 30 |
| API modules | 15 |
| Frontend routes | 9 |
| Prisma models | 15 |
| Prompt files | 8 (4 judges × system + user) |

---

## What Was Built

### Backend (NestJS — `apps/api/`)

**Authentication & Users**
- Email + password login with httpOnly cookie sessions (PostgreSQL-backed)
- Three roles: ADMIN, INTERNAL_ALKOSTO, YALO_READER
- User invitation flow with token-based activation
- Admin user management (list, deactivate, role change, password reset)
- Session cleanup cron, rate limiting on login endpoint

**Data Ingestion**
- Catalog upload: parses JSON product feed, extracts date from filename (`filtered_products_YYYYMMDD`), sanitizes NaN→null, stores all 82+ product fields
- Conversation batch upload: parses JSON array, validates structure, accepts both ISO 8601 and US locale date formats, handles `customer`/`agent` roles
- Run creation: generates unique name (`RUN-YYYYMMDD-{hex}`), persists valid + invalid conversations with reasons

**Evaluation Pipeline**
- BullMQ async worker processes one conversation at a time (configurable concurrency)
- Catalog resolution: exact date match, no catalog → NOT_EVALUABLE
- Four sequential LLM judge calls per conversation:
  1. **Integrity** — validates product claims against catalog, produces typed findings with severity
  2. **Quality** — scores conversation 0–10 with three sub-scores (understanding, recommendation, fluency)
  3. **Patterns** — classifies by taxonomy + detects emergent patterns
  4. **Consolidator** — receives all outputs, decides final score + label + explanation
- Results persisted as Evaluation + Findings + Patterns + immutable Snapshot
- Run aggregation: total/evaluated/failed counts, aggregate score, label distribution, completion status

**Judge Architecture**
- Abstract interfaces with dependency injection tokens
- Fake judges (deterministic) for development and testing
- Gemini judges auto-activate when `GEMINI_API_KEY` env var is set
- Prompts stored as Markdown files at `apps/api/prompts/{judge}/{system,user}.md`
- PromptLoader: loads at startup, substitutes `{{variables}}`, SHA-256 version tracking

**Sharing & Export**
- Share runs/conversations with Yalo (organization-level, read-only)
- YALO_READER role sees only explicitly shared content
- JSON export with phone anonymization (mask central 3 digits)
- Export includes: transcripts, evaluations, prompt versions, catalog info

**Retention & Re-evaluation**
- 3-month expiration set on run completion
- Daily cron cleans expired runs + all related data
- Re-evaluation creates derived runs from filtered subsets (by status, label, finding type, pattern)
- Original snapshots never modified

**Security**
- Helmet security headers
- Global rate limiting (100/min, 10/min on auth)
- Input validation via class-validator DTOs
- Structured logging with pino + correlation IDs
- CORS with configurable origin

### Frontend (Next.js — `apps/web/`)

| Page | Description |
|---|---|
| `/login` | Email + password form with validation |
| `/dashboard` | Latest run summary, score distribution cards, progress polling (3s) |
| `/runs` | Paginated run history table with label distribution bars |
| `/runs/[id]` | Run detail with stats, filterable conversation table, share/export/re-evaluate actions |
| `/runs/[id]/conversations/[id]` | Split panel: WhatsApp-style chat (gray/green bubbles) + evaluation panel (scores, findings, patterns) |
| `/admin/users` | User table with deactivate/role change/reset actions |
| `/admin/invite` | Invite form with generated link |
| `/activate` | Token-based password setup |
| `/shared` | Yalo reader view of shared content |

### Shared Package (`packages/shared/`)

Enums: Role, RunStatus, ConversationStatus, EvaluationLabel, FindingSeverity, EvaluationModule, MessageRole, ShareType. Types: HealthResponse, UserSession.

---

## Database Schema

```
User ─┬─ Session
      ├─ Run ─┬─ Conversation ─┬─ Message
      │       │                ├─ Evaluation ─┬─ Finding
      │       │                │              └─ Pattern
      │       │                ├─ Snapshot
      │       │                └─ ShareRecord
      │       ├─ ShareRecord
      │       └─ ExportJob
      ├─ InviteToken
      └─ Catalog ── CatalogProduct
```

---

## Key Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Conversation roles | `customer`/`agent` | Matches real data (not user/assistant) |
| message_id, timestamp | Optional | Real data doesn't have them |
| Consolidation | 4th LLM judge | More flexible than hardcoded rules |
| Catalog in context | Full catalog sent | Gemini 1M token window makes pre-filtering unnecessary |
| Session strategy | httpOnly cookie + PG table | No Redis dependency for auth, easy invalidation |
| LLM provider | Gemini 2.0 Flash | Already on GCP, 1M context, cost-effective |
| Catalog resolution | Exact date match | Simplest, most predictable |
| Phone masking | At export time | Reversible; raw data in DB for evaluation accuracy |
| Prompt versioning | SHA-256 of file content | Automatic, no manual version bumping |
| Re-evaluation | New derived run | Originals immutable, current prompts used |

---

## What's Not Built (MVP Exclusions)

- SSO / external auth providers
- BigQuery integration
- Admin audit logging
- Real-time notifications
- Image/attachment evaluation
- CSV/Excel export
- Preserving original uploaded files
- Per-user Yalo sharing granularity
- Unshare functionality
- GCS storage adapter (files stored in DB for MVP)
- Cloud Run deployment configuration
- Run comparison vs. previous run (dashboard shows latest only)
- Highlight evidence cross-navigation (clicking finding → message)

---

## How to Run

```bash
# Prerequisites: Node 22+, PostgreSQL 16, Redis 7
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Database
cd apps/api
npx prisma migrate dev
npx prisma db seed    # creates admin@alkosto.com / admin123
cd ../..

# Start
pnpm dev              # web on :3000, api on :3001

# Test
pnpm test             # 248 unit tests
pnpm test:e2e         # Playwright E2E

# With real LLM (optional)
# Set GEMINI_API_KEY in apps/api/.env
```

---

## File Counts

```
apps/api/src/        ~120 TypeScript files (15 modules)
apps/api/prompts/    8 Markdown files (4 judges × 2)
apps/api/prisma/     schema + 3 migrations + seed
apps/web/src/        ~20 TypeScript/TSX files (9 routes)
packages/shared/src/ 4 TypeScript files
```
