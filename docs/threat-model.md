# Threat model

## Assets
- Optional `SAFEMIGRATE_SOURCE_URL` (production-like DB) used only for read-only schema dump
- Shadow Postgres credentials (ephemeral, local Docker)

## Controls
- Source dump phase should use read-only sessions when possible
- Passwords never printed by `doctor` (redacted)
- Shadow containers are disposable and not exposed beyond localhost port mapping
- No AI / no external prompt exfiltration

## Residual risk
- Schema-only analysis cannot predict lock time under large tables
- Generated rollback cannot restore dropped column data
