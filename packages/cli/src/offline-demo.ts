import path from 'node:path'
import {
  catalogFromTables,
  diffCatalogs,
  generateForwardSql,
  generateRollbackSql,
  gradeFromFindings,
  lintMigrations,
  loadMigrations,
  loadPolicy,
  shouldFail,
  verifyAgainstBefore,
} from '@safemigrate/core'
import { writeArtifacts } from './index.js'

/** Offline demo when Docker is unavailable — still emits ROLLBACK.sql from fixture catalogs. */
export async function runOfflineDemo(root: string) {
  const before = catalogFromTables([
    {
      name: 'users',
      primaryKey: ['id'],
      columns: [
        { name: 'id', udtName: 'int4', isNullable: false },
        { name: 'name', udtName: 'text', isNullable: false },
        { name: 'legacy_code', udtName: 'text', isNullable: true },
        { name: 'created_at', udtName: 'timestamptz', isNullable: false, columnDefault: 'now()' },
      ],
    },
    {
      name: 'orders',
      primaryKey: ['id'],
      columns: [
        { name: 'id', udtName: 'int4', isNullable: false },
        { name: 'user_id', udtName: 'int4', isNullable: false },
        { name: 'total_cents', udtName: 'int4', isNullable: false, columnDefault: '0' },
      ],
    },
  ])
  const after = catalogFromTables([
    {
      name: 'users',
      primaryKey: ['id'],
      columns: [
        { name: 'id', udtName: 'int4', isNullable: false },
        { name: 'name', udtName: 'text', isNullable: false },
        { name: 'created_at', udtName: 'timestamptz', isNullable: false, columnDefault: 'now()' },
        { name: 'email', udtName: 'text', isNullable: true },
      ],
    },
    {
      name: 'orders',
      primaryKey: ['id'],
      columns: [
        { name: 'id', udtName: 'int4', isNullable: false },
        { name: 'user_id', udtName: 'int4', isNullable: false },
        { name: 'total_cents', udtName: 'int4', isNullable: false, columnDefault: '0' },
      ],
    },
  ])

  const policy = await loadPolicy(root)
  const files = await loadMigrations(path.join(root, 'fixtures', 'migrations'))
  const struct = diffCatalogs(before, after, { ignoredTables: policy.ignoredTables })
  const findings = [...struct.findings, ...lintMigrations(files)]
  const grade = gradeFromFindings(findings)
  struct.grade = grade
  const rollbackSql = generateRollbackSql(struct, before)
  const forwardSql = generateForwardSql(files.map((f) => ({ name: f.name, sql: f.sql })))
  const verify = verifyAgainstBefore(before, before)
  const outDir = path.join(root, '.safemigrate')
  await writeArtifacts(outDir, {
    beforeCatalog: before,
    afterCatalog: after,
    diff: struct,
    findings,
    rollbackSql,
    forwardSql,
    verify,
  })
  return {
    diff: struct,
    findings,
    outDir,
    grade,
    failed: shouldFail(findings, policy.failOn, policy.allowDestructive),
    verify,
  }
}
