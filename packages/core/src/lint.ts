import type { LintFinding } from './types.js'

/** Expand/contract + lock-hazard statement lint (AST-light). */
export function lintMigrationSql(sql: string, file?: string): LintFinding[] {
  const out: LintFinding[] = []
  const text = sql.replace(/--.*$/gm, '')

  if (/DROP\s+COLUMN/i.test(text)) {
    out.push({
      source: 'statement',
      severity: 'destructive',
      ruleId: 'drop-column',
      message: 'DROP COLUMN is destructive; prefer expand/contract (stop writes, then drop)',
      file,
      hint: 'Keep the column deprecated for one release before dropping.',
    })
  }
  if (/DROP\s+TABLE/i.test(text)) {
    out.push({
      source: 'statement',
      severity: 'destructive',
      ruleId: 'drop-table',
      message: 'DROP TABLE is destructive',
      file,
      hint: 'Rename/archive first; drop in a later contract phase.',
    })
  }
  if (/ADD\s+COLUMN\s+\w+\s+\w+[^;]*NOT\s+NULL(?![^;]*DEFAULT)/i.test(text)) {
    out.push({
      source: 'statement',
      severity: 'caution',
      ruleId: 'add-not-null-no-default',
      message: 'Adding NOT NULL column without DEFAULT can fail on existing rows and locks longer',
      file,
      hint: 'Add nullable (or with DEFAULT), backfill, then set NOT NULL.',
    })
  }
  if (/ALTER\s+COLUMN\s+\w+\s+TYPE/i.test(text)) {
    out.push({
      source: 'statement',
      severity: 'caution',
      ruleId: 'alter-type',
      message: 'ALTER COLUMN TYPE may rewrite the table',
      file,
      hint: 'Use a new column + backfill when the cast is expensive.',
    })
  }
  if (/CREATE\s+(UNIQUE\s+)?INDEX(?!\s+CONCURRENTLY)/i.test(text) && !/CONCURRENTLY/i.test(text)) {
    out.push({
      source: 'statement',
      severity: 'caution',
      ruleId: 'index-no-concurrently',
      message: 'CREATE INDEX without CONCURRENTLY may take an ACCESS EXCLUSIVE-ish lock window',
      file,
      hint: 'Prefer CREATE INDEX CONCURRENTLY outside a transaction.',
    })
  }
  if (/DROP\s+INDEX(?!\s+CONCURRENTLY)/i.test(text) && !/CONCURRENTLY/i.test(text)) {
    out.push({
      source: 'statement',
      severity: 'caution',
      ruleId: 'drop-index-no-concurrently',
      message: 'DROP INDEX without CONCURRENTLY can block writes',
      file,
      hint: 'Prefer DROP INDEX CONCURRENTLY.',
    })
  }
  if (/ACCESS\s+EXCLUSIVE/i.test(text)) {
    out.push({
      source: 'statement',
      severity: 'caution',
      ruleId: 'access-exclusive',
      message: 'Explicit ACCESS EXCLUSIVE lock requested',
      file,
    })
  }
  return out
}

export function needsNoTransaction(sql: string): boolean {
  return /CONCURRENTLY/i.test(sql)
}
