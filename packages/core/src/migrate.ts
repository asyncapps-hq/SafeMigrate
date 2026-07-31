import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { lintMigrationSql, needsNoTransaction } from './lint.js'
import type { LintFinding } from './types.js'
import { execSql } from './introspect.js'

export interface MigrationFile {
  name: string
  path: string
  sql: string
}

export async function loadMigrations(dir: string): Promise<MigrationFile[]> {
  const entries = await readdir(dir)
  const files = entries.filter((f) => f.endsWith('.sql')).sort()
  const out: MigrationFile[] = []
  for (const name of files) {
    const full = path.join(dir, name)
    out.push({ name, path: full, sql: await readFile(full, 'utf8') })
  }
  return out
}

export function lintMigrations(files: MigrationFile[]): LintFinding[] {
  return files.flatMap((f) => lintMigrationSql(f.sql, f.name))
}

export async function applyMigrations(
  connectionString: string,
  files: MigrationFile[],
  opts?: { noTransaction?: boolean },
): Promise<void> {
  for (const f of files) {
    const skipTxn = opts?.noTransaction || needsNoTransaction(f.sql)
    if (skipTxn) {
      await execSql(connectionString, f.sql)
    } else {
      await execSql(connectionString, `BEGIN;\n${f.sql}\nCOMMIT;`)
    }
  }
}
