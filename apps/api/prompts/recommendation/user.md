Evaluate whether the agent's recommendation(s) fit the customer's stated needs and whether a better option existed in the catalog.

## Transcript (JSON array; each turn has `role` = "customer"/"agent", `content`, `orderIndex`)

{{TRANSCRIPT}}

## Stated needs (extracted from the customer's own messages)

{{STATED_NEEDS}}

## Mentioned products (full structured spec sheets — these are what the agent actually recommended or that the discussion focused on)

{{MENTIONED_SPECS}}

## Candidate alternatives (slim entries from the same category and price range — use only to spot missed_better_alternative)

{{CANDIDATE_ALTERNATIVES}}

Return a JSON object with `findings` and `summary` per the schema in the system prompt. JSON only.
