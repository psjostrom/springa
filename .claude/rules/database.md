---
paths: ["src/db/**", "scripts/migrate*", "drizzle/**", "*.sql"]
---

# Database Rules

## Schema changes are atomic — no runtime migrations

When adding columns to a table, the schema change and the data backfill happen together as a single operation. NEVER add runtime migration code that runs on every request. NEVER leave rows with NULL columns expecting "they'll fill in next time."

The correct sequence: update the schema, run the ALTER on the live DB, backfill existing rows in the same session, verify the data, done. One pass, complete data, no side effects.
