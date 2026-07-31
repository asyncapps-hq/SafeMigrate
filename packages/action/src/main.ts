import * as core from '@actions/core'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { repoRootFrom, runSandbox } from '@khyfee/safemigrate'

async function main() {
  const cwd = process.cwd()
  const mode = core.getInput('mode') || 'migrate'
  const migrationsDir = core.getInput('migrations-dir') || 'migrations'
  const baseline = core.getInput('baseline') || ''
  const seed = core.getInput('seed') || ''
  const step = core.getInput('step') === 'true'
  const root = repoRootFrom(import.meta.url)

  if (mode === 'demo') {
    const result = await runSandbox({
      cwd: root,
      migrationsDir: path.join(root, 'fixtures', 'migrations'),
      baselineSql: await readFile(path.join(root, 'fixtures', 'baseline.sql'), 'utf8'),
      seedSql: await readFile(path.join(root, 'fixtures', 'seed.sql'), 'utf8'),
      applyFiles: ['001_add_email.sql', '002_drop_legacy_col.sql'],
      step,
    })
    core.setOutput('grade', result.grade)
    core.setOutput('artifact-dir', result.outDir)
    if (result.failed) core.setFailed(`SafeMigrate policy failed (grade ${result.grade})`)
    return
  }

  const baselinePath = baseline || path.join(root, 'fixtures', 'baseline.sql')
  const result = await runSandbox({
    cwd,
    migrationsDir: path.resolve(cwd, migrationsDir),
    baselineSql: await readFile(path.resolve(cwd, baselinePath), 'utf8'),
    seedSql: seed ? await readFile(path.resolve(cwd, seed), 'utf8') : undefined,
    step,
    sourceUrl: process.env.SAFEMIGRATE_SOURCE_URL,
  })
  core.setOutput('grade', result.grade)
  core.setOutput('artifact-dir', result.outDir)
  if (result.failed) core.setFailed(`SafeMigrate policy failed (grade ${result.grade})`)
}

main().catch((e) => core.setFailed(e instanceof Error ? e.message : String(e)))
