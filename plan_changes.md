# plan_changes.md — Proposed Changes Following the Eval-Framework Review

## Context

A full audit of the codebase (see chat session on `claude/analyze-codebase-vWu9s`) validated that the overall evaluation framework is architecturally sound: separate judges for Integrity, Quality, Pattern, Extraction, Recommendation, plus a Consolidator for the final label, all with SHA-256-versioned prompts and immutable Snapshots.

However, the audit also found that the rubric does not fully measure what a customer actually cares about. Mapped against the 9 customer-centric dimensions the product owner listed, the current rubric scores:

| # | Dimension | Current coverage |
|---|---|---|
| 1 | Fluent | **Strong** (Quality.fluency) |
| 2 | Natural / not robotic | **Partial** (conflated with fluency) |
| 3 | Coherent / makes sense | **Partial** (understanding ≠ flow) |
| 4 | Answering the customer's questions | **Strong** (Quality.understanding) |
| 5 | Warm but not chatty | **Weak** (no conciseness measure) |
| 6 | Info correctness | **Strong** (Integrity judge) |
| 7 | Enough info to recommend | **Partial** (no sparse-needs penalty) |
| 8 | Right amount of clarifying questions first | **Missing** |
| 9 | Should have recommended different product | **Strong** (missed_better_alternative) |

Additional structural issues: the Consolidator does score arithmetic inside an LLM prompt (non-reproducible), the docs say "4 judges" while the code has 5 + Consolidator, and there is no calibration set against which to measure the effect of any prompt change.

This document captures the proposed sequence of changes. Granular task list lives in `todo_changes.md`.

## Guiding principles

1. **Measure before changing.** Build a hand-labeled calibration set first; otherwise any prompt iteration is vibes.
2. **Smallest change first.** Prefer adding a sub-score to an existing judge over creating a new judge.
3. **Prompt-only changes before code changes.** They ship faster and the PromptLoader versions them automatically.
4. **Separate arithmetic from narrative.** Deterministic code should compute the score; the LLM should explain it.
5. **Keep snapshots immutable.** All rubric changes produce new versions, never mutate old ones.

## Proposed phases

### Phase 1 — Baseline calibration (no code/prompt changes)

Goal: create a measurable baseline so subsequent changes can be evaluated.

- Select 20 real conversations covering the label spread (aprobada / con_hallazgos / fallida) and edge cases (very short, very long, no recommendation made, multi-product comparison).
- Hand-label each conversation on all 9 dimensions (1–5 scale per dimension) and note expected final label.
- Run them through the current system with Gemini judges; record per-dimension scores and final labels.
- Compute per-dimension agreement with the hand labels. This is the baseline; future rubric edits must beat it.

Deliverable: `apps/api/calibration/v1/` with conversation JSONs, a `labels.csv`, and a README.

### Phase 2 — Close the highest-leverage rubric gap (#8)

Goal: measure whether the agent gathered enough info before recommending.

- Add `information_gathering` sub-score (0–10) to `apps/api/prompts/quality/system.md` with explicit criteria: did the agent ask about use case, budget, and dealbreakers *before* recommending? Penalize premature recommendations.
- Extend `QualityJudgeResult.subScores` in `apps/api/src/judges/judge.interfaces.ts` to include `informationGathering`.
- Update fake Quality judge and Gemini Quality judge to emit the new sub-score.
- Update `apps/api/src/evaluation/quality/quality.service.ts` normalization (clamp 0–10).
- Update DB: add optional `informationGathering` key inside the existing `qualitySubScores` JSON — no schema migration needed (already `Json`).
- Update frontend evaluation panel (`apps/web/src/app/runs/[id]/conversations/[id]/`) to render the new sub-score.
- Add unit tests covering the new field.
- Re-run Phase 1 calibration; compare per-dimension agreement.

### Phase 3 — Deterministic consolidator

Goal: make the final score reproducible and auditable.

- Create `apps/api/src/evaluation/consolidator/score-calculator.ts`: pure function `(integrity, quality, recommendation) → { score, label }` implementing the rules currently in `consolidator/system.md` L10–16 (deduct 2.0/CRITICAL + 0.5/WARNING integrity; 1.5/CRITICAL + 0.4/WARNING recommendation; cap 5.9 on any CRITICAL; labels by threshold).
- Call it from `consolidator.service.ts` before invoking the Consolidator judge.
- Change the Consolidator judge's role from "decide score + label" to "explain the pre-computed score + label in prose." Update `consolidator/system.md` and `consolidator/user.md` to pass in the already-computed score and label and ask for an `explanation` only.
- Keep the LLM's role: narrative only. Score becomes testable.
- Add unit tests for every branch of the calculator (CRITICAL caps, label thresholds, clamping).
- Re-run calibration to confirm labels didn't shift in unexpected ways.

### Phase 4 — Remaining rubric gaps

Prompt-only edits; order them by expected impact measured on the calibration set after each change.

1. **#5 Conciseness** — new `conciseness` sub-score in Quality (0–10) with examples of "warm but concise" vs "over-verbose."
2. **#7 Sparse needs + confident recommendation** — add Recommendation finding type `recommended_without_sufficient_info` in `apps/api/prompts/recommendation/system.md`. Trigger condition: a recommendation was made and `statedNeeds` lacks both `use_case` and `budget`.
3. **#2 Naturalness** — split naturalness out of fluency or add an emergent Pattern `robotic_phrasing`. Start with the Pattern approach (cheaper, no breaking schema).
4. **#3 Coherence** — add Pattern `topic_jumps` for incoherent flow; evaluate whether a dedicated sub-score is needed after measuring.

For each change: update prompt → update fake judge → update tests → re-run calibration.

### Phase 5 — Technical quick wins (≤1 day each)

Unrelated to the rubric; close in parallel or defer to a second sprint.

- `run.service.ts` L46–77: swap per-row `create` loops for `createMany` (N+1 fix).
- Add indexes: `Message.role`, `Finding.severity`, `Run.expiresAt`.
- Pino log redaction for `*_API_KEY` and `Authorization` headers.
- Broaden phone-anonymization regex in `export.service.ts` L16 to handle missing `+`, 11-digit, and non-`+57` numbers.
- Add upload-size guard in `conversation-parser.service.ts` before JSON.parse.
- Fix the 3 `any` hotspots: `export.service.ts` L24/L32; `run.service.ts` L393; `evaluation.worker.ts` L142.

### Phase 6 — Medium-term (1–2 weeks)

- Move export artifact out of the DB column `exportJob.filePath` into object storage (GCS adapter is already on the "not built" list in `summary.md`).
- Add HTTP-level integration tests for the currently-untested controllers: Catalog, Export, Invitation, Reevaluation, Retention, Run, Sharing, User.
- Tighten sharing: either ephemeral tokenized URLs, or scope `GET /sharing/runs` to explicitly granted runs per user.
- Optional: one real-API smoke test for the Gemini client (gated on env var).

### Phase 7 — Docs refresh (do last, to avoid re-writing)

- Update `CLAUDE.md` §"Four LLM Judges" → five judges + consolidator, with the extraction→recommendation chain.
- Update `summary.md` to reflect the new sub-scores, the deterministic consolidator, and the calibration baseline.
- Add a short `apps/api/prompts/README.md` documenting the rubric dimensions and how they map to customer-lens questions.

## Out of scope (explicit)

- SSO, audit logging, BigQuery sink (tracked in `summary.md` §"What's Not Built").
- CSRF tokens: current SameSite=Lax cookies + same-origin architecture is acceptable; revisit if cross-origin auth is ever added.
- A separate "Process" judge for dimension #8: revisit only if the sub-score approach proves insufficient on calibration.

## Success criteria

- Calibration-set per-dimension agreement improves on #2, #3, #5, #7, #8 compared to Phase-1 baseline.
- Final score is deterministic: same judge outputs always produce the same score and label.
- All existing 248 unit tests still pass; new tests cover each new sub-score, finding type, and the score calculator.
- Docs accurately describe the system.

## Rollout order summary

Phase 1 (baseline) → Phase 2 (#8) → Phase 3 (deterministic consolidator) → Phase 4 (remaining rubric) → Phase 5 (tech debt) → Phase 6 (medium-term) → Phase 7 (docs).

Phases 2 and 3 are the critical path for the product-lens improvements; 5–7 can run in parallel on separate branches.
