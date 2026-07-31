import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeArtifacts } from '@khyfee/safemigrate'
import { catalogFromTables, diffCatalogs, generateRollbackSql, generateForwardSql } from '@safemigrate/core'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

test('writeArtifacts creates ROLLBACK.sql', async () => {
  const before = catalogFromTables([
    { name: 't', columns: [{ name: 'a', udtName: 'text' }, { name: 'b', udtName: 'text' }] },
  ])
  const after = catalogFromTables([{ name: 't', columns: [{ name: 'a', udtName: 'text' }] }])
  const diff = diffCatalogs(before, after)
  const dir = await mkdtemp(path.join(tmpdir(), 'sm-'))
  await writeArtifacts(dir, {
    beforeCatalog: before,
    afterCatalog: after,
    diff,
    findings: diff.findings,
    rollbackSql: generateRollbackSql(diff, before),
    forwardSql: generateForwardSql([{ name: 'x.sql', sql: 'SELECT 1' }]),
  })
  const rb = await readFile(path.join(dir, 'ROLLBACK.sql'), 'utf8')
  assert.match(rb, /ADD COLUMN/)
})
