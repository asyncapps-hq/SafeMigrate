import { mkdir, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AUTHOR,
  PRODUCT,
  applyMigrations,
  diffCatalogs,
  generateForwardSql,
  generateRollbackSql,
  introspectCatalog,
  lintMigrations,
  loadMigrations,
  loadPolicy,
  mergePolicy,
  renderDiffMarkdown,
  renderReportMarkdown,
  seedChecksum,
  shouldFail,
  verifyAgainstBefore,
  execSql,
  gradeFromFindings,
  type DiffResult,
  type Finding,
  type TimelineEntry,
  type VerifyResult,
} from '@safemigrate/core'
import {
  cloneFromSource,
  dockerAvailable,
  dumpSchemaSql,
  execSqlInContainer,
  startShadow,
  stopShadow,
  type ShadowInfo,
} from '@safemigrate/docker'

export function repoRootFrom(metaUrl: string): string {
  return path.resolve(path.dirname(fileURLToPath(metaUrl)), '../../..')
}

export async function writeArtifacts(
  outDir: string,
  payload: {
    beforeSql?: string
    afterSql?: string
    beforeCatalog: unknown
    afterCatalog: unknown
    diff: DiffResult
    findings: Finding[]
    rollbackSql: string
    forwardSql: string
    verify?: VerifyResult
    timeline?: TimelineEntry[]
  },
) {
  await mkdir(outDir, { recursive: true })
  if (payload.beforeSql) await writeFile(path.join(outDir, 'before.sql'), payload.beforeSql)
  if (payload.afterSql) await writeFile(path.join(outDir, 'after.sql'), payload.afterSql)
  await writeFile(path.join(outDir, 'before.catalog.json'), JSON.stringify(payload.beforeCatalog, null, 2))
  await writeFile(path.join(outDir, 'after.catalog.json'), JSON.stringify(payload.afterCatalog, null, 2))
  await writeFile(path.join(outDir, 'diff.json'), JSON.stringify(payload.diff, null, 2))
  await writeFile(path.join(outDir, 'diff.md'), renderDiffMarkdown(payload.diff))
  await writeFile(path.join(outDir, 'ROLLBACK.sql'), payload.rollbackSql)
  await writeFile(path.join(outDir, 'FORWARD.sql'), payload.forwardSql)
  await writeFile(
    path.join(outDir, 'report.md'),
    renderReportMarkdown({
      diff: payload.diff,
      findings: payload.findings,
      verify: payload.verify,
      timeline: payload.timeline,
    }),
  )
  if (payload.verify) {
    await writeFile(path.join(outDir, 'verify.json'), JSON.stringify(payload.verify, null, 2))
  }
  if (payload.timeline) {
    await writeFile(path.join(outDir, 'timeline.json'), JSON.stringify(payload.timeline, null, 2))
  }
}

export async function runSandbox(opts: {
  cwd: string
  migrationsDir: string
  baselineSql?: string
  seedSql?: string
  step?: boolean
  applyFiles?: string[] // filter by name
  sourceUrl?: string
  keepContainer?: boolean
}): Promise<{
  shadow: ShadowInfo
  diff: DiffResult
  findings: Finding[]
  rollbackSql: string
  verify: VerifyResult
  failed: boolean
  outDir: string
  grade: string
}> {
  const policy = await loadPolicy(opts.cwd)
  const shadow = await startShadow({
    port: policy.shadowPort,
    image: policy.postgresImage,
  })

  try {
    if (opts.sourceUrl) {
      await cloneFromSource(shadow, opts.sourceUrl)
    } else if (opts.baselineSql) {
      await execSqlInContainer(shadow, opts.baselineSql)
    }

    if (opts.seedSql) {
      await execSqlInContainer(shadow, opts.seedSql)
    }

    const beforeCatalog = await introspectCatalog(shadow.connectionString)
    const beforeSql = await dumpSchemaSql(shadow)
    const seedBefore = opts.seedSql ? await seedChecksum(shadow.connectionString) : null

    let files = await loadMigrations(opts.migrationsDir)
    if (opts.applyFiles) {
      files = files.filter((f) => opts.applyFiles!.includes(f.name))
    }

    const lintAll = await loadMigrations(opts.migrationsDir)
    const stmtFindings = lintMigrations(lintAll)

    const timeline: TimelineEntry[] = []
    if (opts.step) {
      let prev = beforeCatalog
      for (const f of files) {
        await applyMigrations(shadow.connectionString, [f])
        const snap = await introspectCatalog(shadow.connectionString)
        const d = diffCatalogs(prev, snap, { ignoredTables: policy.ignoredTables })
        timeline.push({
          migration: f.name,
          grade: d.grade,
          destructiveCount: d.changes.filter((c) => c.severity === 'destructive' || c.severity === 'irreversible').length,
          changes: d.changes,
        })
        prev = snap
      }
    } else {
      await applyMigrations(shadow.connectionString, files)
    }

    const afterCatalog = await introspectCatalog(shadow.connectionString)
    const afterSql = await dumpSchemaSql(shadow)
    const struct = diffCatalogs(beforeCatalog, afterCatalog, { ignoredTables: policy.ignoredTables })
    const findings: Finding[] = [...struct.findings, ...stmtFindings]
    const grade = gradeFromFindings(findings)
    struct.grade = grade
    const rollbackSql = generateRollbackSql(struct, beforeCatalog)
    const forwardSql = generateForwardSql(files)

    // verify-rollback on same shadow (after → apply rollback → compare to before)
    await execSql(shadow.connectionString, rollbackSql)
    const restored = await introspectCatalog(shadow.connectionString)
    const verify = verifyAgainstBefore(beforeCatalog, restored)
    if (seedBefore != null) {
      const seedAfter = await seedChecksum(shadow.connectionString)
      verify.seedOk = seedAfter === seedBefore
      if (struct.changes.some((c) => c.kind === 'column_dropped' || c.kind === 'table_dropped')) {
        verify.seedOk = true
      } else if (verify.seedOk === false) {
        verify.ok = false
        verify.mismatches.push('seed checksum mismatch after rollback')
      }
    }

    const outDir = path.join(opts.cwd, '.safemigrate')
    await writeArtifacts(outDir, {
      beforeSql,
      afterSql,
      beforeCatalog,
      afterCatalog,
      diff: struct,
      findings,
      rollbackSql,
      forwardSql,
      verify,
      timeline: timeline.length ? timeline : undefined,
    })

    const failed = shouldFail(findings, policy.failOn, policy.allowDestructive)
    return { shadow, diff: struct, findings, rollbackSql, verify, failed, outDir, grade }
  } finally {
    if (!opts.keepContainer) await stopShadow(shadow.containerName)
  }
}

export async function doctor(cwd: string) {
  const policy = await loadPolicy(cwd)
  const docker = await dockerAvailable()
  const source = process.env.SAFEMIGRATE_SOURCE_URL
  return {
    banner: `${PRODUCT} by ${AUTHOR}`,
    node: process.version,
    docker,
    shadowPort: policy.shadowPort,
    postgresImage: policy.postgresImage,
    failOn: policy.failOn,
    sourceConfigured: Boolean(source),
    sourceRedacted: source ? source.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@') : null,
  }
}

export { mergePolicy, loadPolicy, dockerAvailable, startShadow, stopShadow, execSqlInContainer }
