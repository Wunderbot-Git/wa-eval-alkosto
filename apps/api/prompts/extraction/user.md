Extract mentioned product IDs and customer stated needs from this conversation.

## Transcript (JSON array; each turn has `role` = "customer"/"agent", `content`, `orderIndex`)

{{TRANSCRIPT}}

## Catalog index (JSON array; each product has `externalId`, `title`, `listPrice`, `salePrice`, `category`, `brand`)

{{CATALOG}}

Return a JSON object with `mentionedExternalIds` and `statedNeeds` per the schema in the system prompt. JSON only.
