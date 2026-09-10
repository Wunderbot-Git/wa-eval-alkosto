# Deployment — Google Cloud (autogestion-alkosto)

Runbook for deploying the WA Eval System into the Alkosto-provided GCP project
**`autogestion-alkosto`**. All commands run from the repo root on a machine with
`gcloud` and `terraform` (>= 1.5) installed and authenticated.

> **Heads-up: shared project.** `autogestion-alkosto` looks like a shared
> corporate project, not a dedicated one. Everything this deployment creates is
> prefixed `eval-` (services, VPC, SQL instance, Redis, secrets, service
> account), so it won't collide with existing workloads — but organization
> policies may still restrict some steps (see Preflight).

## Architecture

| Component | GCP resource | Name |
|---|---|---|
| API (NestJS + worker) | Cloud Run service | `eval-api` |
| Web (Next.js) | Cloud Run service | `eval-web` |
| Database | Cloud SQL PostgreSQL 16 (private IP) | `eval-postgres` |
| Job queue | Memorystore Redis 7 | `eval-redis` |
| Images | Artifact Registry | `eval-images` |
| Migrations | Cloud Run Job (runs in VPC) | `eval-migrate` |
| Config | Secret Manager | `database-url`, `redis-url`, `session-secret`, `gemini-api-key` |
| LLM | Vertex AI (Gemini) or Gemini API | — |

The web app calls the API through a same-origin `/api/*` rewrite; the API URL is
**baked into the web image at build time** via the `BACKEND_URL` build arg.

## 0. Preflight checks

```bash
gcloud config set project autogestion-alkosto
gcloud auth application-default login   # for terraform

# Which roles do you have? (ideally roles/editor or owner; plus
# roles/resourcemanager.projectIamAdmin for the IAM bindings in terraform)
gcloud projects get-iam-policy autogestion-alkosto \
  --flatten="bindings[].members" \
  --filter="bindings.members:$(gcloud config get-value account)" \
  --format="value(bindings.role)"
```

Org policies worth checking with the Alkosto cloud team (common in corporate orgs):

- **`iam.allowedPolicyMemberDomains` (Domain Restricted Sharing)** — blocks the
  `allUsers` bindings that make `eval-web`/`eval-api` publicly reachable. If
  blocked, the services need an internal ingress + IAP or a load balancer setup
  instead; ask before running `terraform apply` with `deploy_services = true`.
- **`constraints/compute.restrictVpcPeering`** — would block the private
  services connection needed for Cloud SQL private IP.
- Whether **Vertex AI** is enabled/permitted in the project (for `gemini_mode = "vertex"`),
  and whether the **global endpoint** is allowed (`vertex_location = "global"`;
  fall back to `us-central1` otherwise).

## 1. Provision infrastructure (Terraform)

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars:
#   - db_password:    strong password  (e.g. openssl rand -base64 24)
#   - session_secret: random 64 chars  (e.g. openssl rand -hex 32)
#   - gemini_mode:    "vertex" recommended (no API key needed)
#   - deploy_services stays false for now (images don't exist yet)

terraform init
terraform apply
```

This enables the required APIs and creates VPC, Cloud SQL, Redis, Artifact
Registry, Secret Manager entries, and the service account. It takes ~15–20 min
(Cloud SQL is slow to provision).

## 2. Build and push images (Cloud Build)

The web image needs the API's future URL. Cloud Run v2 URLs are deterministic:

```bash
PROJECT_NUMBER=$(gcloud projects describe autogestion-alkosto --format='value(projectNumber)')
REGION=us-central1   # must match terraform.tfvars
BACKEND_URL="https://eval-api-${PROJECT_NUMBER}.${REGION}.run.app"

cd ..   # repo root
gcloud builds submit \
  --config cloudbuild-images.yaml \
  --substitutions "_REGION=${REGION},_BACKEND_URL=${BACKEND_URL}"
```

## 3. Deploy services

```bash
cd infra
# set deploy_services = true in terraform.tfvars
terraform apply
terraform output   # shows api_url and web_url
```

## 4. Migrate + seed the database

Cloud SQL has no public IP, so migrations run as a Cloud Run Job inside the VPC
(the full pipeline in `cloudbuild.yaml` does this automatically on every build):

```bash
REGION=us-central1
IMAGE="${REGION}-docker.pkg.dev/autogestion-alkosto/eval-images/eval-api:latest"

gcloud run jobs deploy eval-migrate \
  --image="${IMAGE}" --region="${REGION}" \
  --vpc-connector=eval-vpc-connector --vpc-egress=all-traffic \
  --set-secrets=DATABASE_URL=database-url:latest \
  --command=sh --args='-c,cd /app/apps/api && HOME=/tmp npx prisma migrate deploy' \
  --max-retries=0 --task-timeout=600 --execute-now --wait

# One-time: seed the admin user (admin@alkosto.com / admin123 — change it right after login)
gcloud run jobs deploy eval-seed \
  --image="${IMAGE}" --region="${REGION}" \
  --vpc-connector=eval-vpc-connector --vpc-egress=all-traffic \
  --set-secrets=DATABASE_URL=database-url:latest \
  --command=sh --args='-c,cd /app/apps/api && HOME=/tmp npx prisma db seed' \
  --max-retries=0 --task-timeout=300 --execute-now --wait
```

## 5. Verify

```bash
API_URL=$(cd infra && terraform output -raw api_url)
WEB_URL=$(cd infra && terraform output -raw web_url)

curl -fsS "${API_URL}/health"     # {"status":"ok",...}
open "${WEB_URL}"                  # login page
```

Log in as `admin@alkosto.com` / `admin123`, **change the password**, upload a
catalog + conversation batch, launch a run. In Cloud Logging, the API should log
`Using Gemini judges via Vertex AI` (or `via API key`) at startup — if it says
`Using fake judges`, the Gemini env vars didn't reach the service.

## 6. Continuous deployment (optional)

Connect the GitHub repo in Cloud Build → Triggers and create a trigger on the
main branch using `cloudbuild.yaml` with substitutions
`_REGION` and `_BACKEND_URL` (values from step 2). Every push then builds both
images, runs migrations, and rolls both Cloud Run services.

## Daily conversation auto-import (workspace)

The review workspace can import yesterday's conversations from the shared
BigQuery view automatically, every day at 06:00 Colombia time (it covers the
last two days, so a failed run heals itself the next morning; imports are
idempotent and never duplicate messages). To enable it in the deployment:

1. In `terraform.tfvars`: `auto_import_daily = true`, `api_min_instances = 1`
   (a scale-to-zero service has no running process at 06:00, so the schedule
   would never fire), and `bigquery_project` if the billing project differs
   from `GOOGLE_CLOUD_PROJECT`.
2. Grant the `eval-cloudrun` service account BigQuery access — this is in the
   project that hosts the shared view (`yalo-eval-wa`), so it cannot be done
   from this Terraform: `roles/bigquery.jobUser` on the billing project and
   read access to the shared dataset (ask whoever administers `yalo-eval-wa`).
3. `terraform apply`. Locally, the same feature is `AUTO_IMPORT_DAILY=true`
   in `apps/api/.env` — the API process must be running at 06:00.

The workspace UI's "Importar día anterior ahora" button runs the same
idempotent import on demand, e.g. to backfill a missed day. Costs are capped
per query by `maximumBytesBilled` (5 GB — a typical day is a few MB).

### Automatic daily evaluation

Right after the import, the same schedule can evaluate the conversations that
are worth judging. A conversation is skipped when it has no dialogue (the
customer never answered the agent's first message), when it ends close to the
import cutoff and might continue the next day, when it has fewer than
`EVALUATE_MIN_MESSAGES` customer/agent messages (closure, survey, reset and
trace events do not count, so template noise cannot inflate the total), or
when the customer contributed fewer than `EVALUATE_MIN_CUSTOMER_TURNS`
messages. Evaluating a single conversation by hand stays possible for all of
them.

Enable it with `auto_evaluate_daily = true` (plus `api_min_instances = 1` and
a working Gemini configuration). `auto_evaluate_limit` caps one run — each
conversation costs two model calls, so this is the guard against an unusually
large import turning into an unexpected bill. Locally the same switches are
`AUTO_EVALUATE_DAILY=true` and `AUTO_EVALUATE_LIMIT` in `apps/api/.env`.

In the workspace, the "Sin evaluar" section of Revisión shows how many of the
pending conversations qualify and can start a batch of up to 50 on demand; it
runs in the background and the queue reports its progress.

## Gemini configuration reference

| `gemini_mode` (tfvars) | Env vars set on `eval-api` | Notes |
|---|---|---|
| `vertex` (recommended) | `GEMINI_USE_VERTEX=true`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION` | Auth via the `eval-cloudrun` service account (`roles/aiplatform.user` is granted by Terraform). No key to manage. |
| `api_key` | `GEMINI_API_KEY` from Secret Manager | Requires `gemini_api_key` in tfvars. |
| `fake` | — | Deterministic fake judges; useful for a first smoke deployment. |

Switching modes later: change `gemini_mode` in `terraform.tfvars`, run
`terraform apply` — only the Cloud Run env vars and IAM binding change.

## Cost estimate (light usage)

Cloud SQL `db-f1-micro` (~\$9/mo) + Memorystore 1 GB Basic (~\$35/mo) are the
fixed costs; Cloud Run scales to zero. Memorystore is the biggest lever — if
cost matters more than managed Redis, it could be replaced by Upstash or a
small Compute Engine instance later.
