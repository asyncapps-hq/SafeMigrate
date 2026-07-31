import type { CatalogSnapshot, ColumnDef, DiffChange, DiffResult, TableDef } from './types.js'

function quoteIdent(id: string): string {
  return `"${id.replace(/"/g, '""')}"`
}

function columnDdl(c: ColumnDef): string {
  const nullSql = c.isNullable ? 'NULL' : 'NOT NULL'
  const def = c.columnDefault != null ? ` DEFAULT ${c.columnDefault}` : ''
  return `${quoteIdent(c.name)} ${c.udtName} ${nullSql}${def}`
}

function createTableSql(t: TableDef): string {
  const cols = t.columns.map(columnDdl).join(',\n  ')
  const pk = t.primaryKey.length
    ? `,\n  PRIMARY KEY (${t.primaryKey.map(quoteIdent).join(', ')})`
    : ''
  return `CREATE TABLE ${quoteIdent(t.name)} (\n  ${cols}${pk}\n);`
}

/** Generate best-effort rollback SQL from a structural diff + before catalog. */
export function generateRollbackSql(diff: DiffResult, before: CatalogSnapshot): string {
  const lines: string[] = [
    '-- SafeMigrate ROLLBACK.sql (generated)',
    '-- By KhyFee — schema structure only; DATA LOSS where noted.',
    'BEGIN;',
    '',
  ]

  // Reverse order matters loosely: drop added things first, then restore dropped
  for (const ch of [...diff.changes].reverse()) {
    lines.push(...rollbackForChange(ch, before))
  }

  lines.push('', 'COMMIT;', '')
  return lines.join('\n')
}

function rollbackForChange(ch: DiffChange, before: CatalogSnapshot): string[] {
  switch (ch.kind) {
    case 'column_added': {
      const [table, col] = ch.object.split('.')
      return [`ALTER TABLE ${quoteIdent(table!)} DROP COLUMN IF EXISTS ${quoteIdent(col!)};`]
    }
    case 'column_dropped': {
      const col = ch.before as ColumnDef
      return [
        `-- DATA LOSS: values in ${ch.object} cannot be restored from schema alone`,
        `ALTER TABLE ${quoteIdent(col.table)} ADD COLUMN IF NOT EXISTS ${columnDdl(col)};`,
      ]
    }
    case 'table_added':
      return [`DROP TABLE IF EXISTS ${quoteIdent(ch.object)} CASCADE;`]
    case 'table_dropped': {
      const t = ch.before as TableDef
      return [`-- DATA LOSS: rows in ${t.name} cannot be restored`, createTableSql(t)]
    }
    case 'column_changed': {
      const beforeCol = ch.before as ColumnDef
      return [
        `-- WARNING: cast back to ${beforeCol.udtName} may fail`,
        `ALTER TABLE ${quoteIdent(beforeCol.table)} ALTER COLUMN ${quoteIdent(beforeCol.name)} TYPE ${beforeCol.udtName};`,
        beforeCol.isNullable
          ? `ALTER TABLE ${quoteIdent(beforeCol.table)} ALTER COLUMN ${quoteIdent(beforeCol.name)} DROP NOT NULL;`
          : `ALTER TABLE ${quoteIdent(beforeCol.table)} ALTER COLUMN ${quoteIdent(beforeCol.name)} SET NOT NULL;`,
      ]
    }
    case 'index_dropped': {
      const def = (ch.before as { definition?: string })?.definition
      return def ? [`${def};`] : [`-- missing index definition for ${ch.object}`]
    }
    case 'index_added':
      return [`DROP INDEX IF EXISTS ${quoteIdent(ch.object)};`]
    case 'fk_added':
      return [
        `ALTER TABLE ${quoteIdent((ch.after as { table: string }).table)} DROP CONSTRAINT IF EXISTS ${quoteIdent(ch.object)};`,
      ]
    case 'enum_changed':
      return [`-- IRREVERSIBLE: enum ${ch.object} value removal cannot be safely auto-rolled back in Postgres`]
    default:
      return [`-- No automatic rollback for ${ch.kind} on ${ch.object}`]
  }
}

export function generateForwardSql(files: Array<{ name: string; sql: string }>): string {
  const parts = ['-- SafeMigrate FORWARD.sql (applied migrations archive)', '-- By KhyFee', '']
  for (const f of files) {
    parts.push(`-- >>> ${f.name}`, f.sql.trim(), '')
  }
  return parts.join('\n')
}
