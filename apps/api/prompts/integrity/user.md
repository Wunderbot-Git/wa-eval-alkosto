Evaluate the following conversation for data integrity issues.

## Transcript (JSON array; each turn has `role` = "customer"/"agent", `content`, `orderIndex`)

{{TRANSCRIPT}}

## Catalog index (slim — JSON array of every product available on the conversation's date; each has `externalId`, `title`, `listPrice`, `salePrice`, `category`, `brand`)

{{CATALOG}}

## Mentioned product spec sheets (full structured fields for products referenced in the conversation — TRUST THESE OVER THE TITLE)

{{MENTIONED_SPECS}}

Return a JSON object with a `findings` array per the schema in the system prompt. No commentary, JSON only.
