#!/usr/bin/env node
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { AUTHOR, PRODUCT, renderDiffMarkdown } from '@safemigrate/core'
import { doctor, repoRootFrom, runSandbox } from './index.js'
import { dockerAvailable, startShadow, stopShadow, execSqlInContainer } from '@safemigrate/docker'

const args = process.argv.slice(2)
const cmd = args[0] ?? 'help'

function flag(name: string): string | undefined {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

async function main() {
  const cwd = process.cwd()

  if (cmd === 'doctor') {
    console.log(JSON.stringify(await doctor(cwd), null, 2))
    return
  }

  if (cmd === 'up') {
    if (!(await dockerAvailable())) {
      console.error('Docker not available')
      process.exitCode = 2
      return
    }
    const shadow = await startShadow({ port: Number(flag('--port') || 55432) })
    console.log(JSON.stringify(shadow, null, 2))
    console.log('Container left running; use safemigrate down --name ' + shadow.containerName)
    return
  }

  if (cmd === 'down') {
    const name = flag('--name')
    if (!name) {
      console.error('Usage: safemigrate down --name <container>')
      process.exitCode = 1
      return
    }
    await stopShadow(name)
    console.log('removed', name)
    return
  }

  if (cmd === 'demo') {
    console.log(`${PRODUCT} by ${AUTHOR}`)
    const root = repoRootFrom(import.meta.url)
    const strict = args.includes('--strict')
    const step = args.includes('--step')

    if (!(await dockerAvailable())) {
      console.log('Docker not available — running offline fixture demo (catalog diff only).')
      const { runOfflineDemo } = await import('./offline-demo.js')
      const result = await runOfflineDemo(root)
      console.log(renderDiffMarkdown(result.diff))
      console.log(`Artifacts: ${result.outDir}`)
      console.log(`ROLLBACK: ${path.join(result.outDir, 'ROLLBACK.sql')}`)
      console.log('Demo OK (offline)')
      if (strict && result.failed) process.exitCode = 1
      return
    }

    const baselineSql = await readFile(path.join(root, 'fixtures', 'baseline.sql'), 'utf8')
    const seedSql = await readFile(path.join(root, 'fixtures', 'seed.sql'), 'utf8')
    const result = await runSandbox({
      cwd: root,
      migrationsDir: path.join(root, 'fixtures', 'migrations'),
      baselineSql,
      seedSql,
      step,
      applyFiles: ['001_add_email.sql', '002_drop_legacy_col.sql'],
    })
    console.log(renderDiffMarkdown(result.diff))
    console.log(`Artifacts: ${result.outDir}`)
    console.log(`ROLLBACK: ${path.join(result.outDir, 'ROLLBACK.sql')}`)
    console.log(`Verify: ${result.verify.ok ? 'PASS' : 'FAIL'} grade=${result.grade}`)
    console.log('Demo OK')
    if (strict && result.failed) process.exitCode = 1
    return
  }

  if (cmd === 'migrate' || cmd === 'diff' || cmd === 'rollback-plan' || cmd === 'verify-rollback') {
    if (!(await dockerAvailable())) {
      console.error('Docker is required')
      process.exitCode = 2
      return
    }
    const root = repoRootFrom(import.meta.url)
    const dir = flag('--dir') ?? path.join(cwd, 'migrations')
    const baseline = flag('--baseline') ?? path.join(root, 'fixtures', 'baseline.sql')
    const seed = flag('--seed')
    const result = await runSandbox({
      cwd,
      migrationsDir: path.resolve(cwd, dir),
      baselineSql: await readFile(path.resolve(cwd, baseline), 'utf8'),
      seedSql: seed ? await readFile(path.resolve(cwd, seed), 'utf8') : undefined,
      step: args.includes('--step'),
      sourceUrl: process.env.SAFEMIGRATE_SOURCE_URL,
    })
    console.log(renderDiffMarkdown(result.diff))
    console.log(`Artifacts: ${result.outDir}`)
    process.exitCode = result.failed ? 1 : 0
    return
  }

  if (cmd === 'report') {
    const diffPath = path.join(cwd, '.safemigrate', 'diff.md')
    try {
      console.log(await readFile(diffPath, 'utf8'))
    } catch {
      console.error('No .safemigrate/diff.md — run demo or migrate first')
      process.exitCode = 1
    }
    return
  }

  if (cmd === 'clone') {
    if (!(await dockerAvailable())) {
      process.exitCode = 2
      return
    }
    const source = flag('--source') || process.env.SAFEMIGRATE_SOURCE_URL
    const baseline = flag('--baseline')
    const shadow = await startShadow()
    try {
      if (source) {
        const { cloneFromSource } = await import('@safemigrate/docker')
        await cloneFromSource(shadow, source)
      } else if (baseline) {
        await execSqlInContainer(shadow, await readFile(path.resolve(cwd, baseline), 'utf8'))
      } else {
        throw new Error('Provide --source or --baseline')
      }
      console.log('cloned into', shadow.connectionString.replace(/:[^:@]+@/, ':***@'))
      console.log('container', shadow.containerName)
    } catch (e) {
      await stopShadow(shadow.containerName)
      throw e
    }
    return
  }

  console.log(`${PRODUCT} by ${AUTHOR}
Usage:
  safemigrate doctor
  safemigrate demo [--strict] [--step]
  safemigrate migrate --dir <migrations> [--baseline <sql>] [--seed <sql>] [--step]
  safemigrate report
  safemigrate up [--port N]
  safemigrate down --name <container>
  safemigrate clone --baseline <sql> | --source <url>
`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 2
})
