import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  catalogFromTables,
  diffCatalogs,
  generateRollbackSql,
  lintMigrationSql,
  gradeFromFindings,
  shouldFail,
  verifyAgainstBefore,
  mergePolicy,
} from './index.js'

const before = catalogFromTables([
  {
    name: 'users',
    primaryKey: ['id'],
    columns: [
      { name: 'id', udtName: 'int4', isNullable: false },
      { name: 'legacy_code', udtName: 'text', isNullable: true },
      { name: 'name', udtName: 'text', isNullable: false },
    ],
  },
])

test('detects dropped column as destructive', () => {
  const after = catalogFromTables([
    {
      name: 'users',
      primaryKey: ['id'],
      columns: [
        { name: 'id', udtName: 'int4', isNullable: false },
        { name: 'name', udtName: 'text', isNullable: false },
      ],
    },
  ])
  const diff = diffCatalogs(before, after)
  assert.ok(diff.changes.some((c) => c.kind === 'column_dropped'))
  assert.equal(diff.grade, 'D')
  const rb = generateRollbackSql(diff, before)
  assert.match(rb, /ADD COLUMN/i)
  assert.match(rb, /legacy_code/)
  assert.match(rb, /DATA LOSS/)
})

test('statement lint drop column + not null', () => {
  const a = lintMigrationSql('ALTER TABLE users DROP COLUMN legacy_code;')
  assert.ok(a.some((f) => f.ruleId === 'drop-column'))
  const b = lintMigrationSql('ALTER TABLE users ADD COLUMN age int NOT NULL;')
  assert.ok(b.some((f) => f.ruleId === 'add-not-null-no-default'))
})

test('verify pass/fail and policy', () => {
  const after = catalogFromTables([
    {
      name: 'users',
      columns: [
        { name: 'id', udtName: 'int4', isNullable: false },
        { name: 'name', udtName: 'text', isNullable: false },
      ],
    },
  ])
  const restored = before
  assert.equal(verifyAgainstBefore(before, restored).ok, true)
  assert.equal(verifyAgainstBefore(before, after).ok, false)
  const findings = diffCatalogs(before, after).findings
  assert.equal(shouldFail(findings, 'destructive'), true)
  assert.equal(shouldFail(findings, 'never'), false)
  assert.equal(gradeFromFindings([]), 'A')
  assert.equal(mergePolicy({ failOn: 'caution' }).failOn, 'caution')
})

test('added column rollback drops it', () => {
  const after = catalogFromTables([
    {
      name: 'users',
      columns: [
        { name: 'id', udtName: 'int4', isNullable: false },
        { name: 'legacy_code', udtName: 'text', isNullable: true },
        { name: 'name', udtName: 'text', isNullable: false },
        { name: 'email', udtName: 'text', isNullable: true },
      ],
    },
  ])
  const diff = diffCatalogs(before, after)
  const rb = generateRollbackSql(diff, before)
  assert.match(rb, /DROP COLUMN IF EXISTS "email"/i)
})
