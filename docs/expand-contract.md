# Expand / contract guide

1. **Expand** — add nullable columns, new tables, dual-write if needed.
2. **Migrate** — backfill, switch reads.
3. **Contract** — drop legacy columns/tables only after traffic stops using them.

SafeMigrate flags one-shot `DROP COLUMN` / `DROP TABLE` and `ADD … NOT NULL` without `DEFAULT` so PRs stay in expand/contract discipline.
