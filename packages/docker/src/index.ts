import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'

export interface ShadowInfo {
  containerName: string
  port: number
  connectionString: string
  user: string
  password: string
  database: string
}

function run(cmd: string, args: string[], opts?: { input?: string }): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      shell: false,
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    if (opts?.input) {
      child.stdin.write(opts.input)
      child.stdin.end()
    }
    child.on('error', (err) => resolve({ code: 1, stdout, stderr: String(err) }))
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
  })
}

export async function dockerAvailable(): Promise<boolean> {
  const r = await run('docker', ['info'])
  return r.code === 0
}

export async function startShadow(opts?: {
  port?: number
  image?: string
  name?: string
}): Promise<ShadowInfo> {
  const port = opts?.port ?? Number(process.env.SAFEMIGRATE_SHADOW_PORT || 55432)
  const image = opts?.image ?? 'postgres:16-alpine'
  const containerName = opts?.name ?? `safemigrate-shadow-${randomBytes(4).toString('hex')}`
  const user = 'safemigrate'
  const password = 'safemigrate'
  const database = 'safemigrate'

  // remove stale same-name if any
  await run('docker', ['rm', '-f', containerName])

  const start = await run('docker', [
    'run',
    '-d',
    '--name',
    containerName,
    '-e',
    `POSTGRES_USER=${user}`,
    '-e',
    `POSTGRES_PASSWORD=${password}`,
    '-e',
    `POSTGRES_DB=${database}`,
    '-p',
    `${port}:5432`,
    image,
  ])
  if (start.code !== 0) {
    throw new Error(`docker run failed: ${start.stderr || start.stdout}`)
  }

  const connectionString = `postgres://${user}:${password}@127.0.0.1:${port}/${database}`
  await waitHealthy(containerName, 60_000)
  return { containerName, port, connectionString, user, password, database }
}

async function waitHealthy(containerName: string, timeoutMs: number): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const r = await run('docker', ['exec', containerName, 'pg_isready', '-U', 'safemigrate'])
    if (r.code === 0) return
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`shadow postgres not ready: ${containerName}`)
}

export async function stopShadow(containerName: string): Promise<void> {
  await run('docker', ['rm', '-f', containerName])
}

export async function execSqlInContainer(
  info: ShadowInfo,
  sql: string,
): Promise<void> {
  const r = await run(
    'docker',
    ['exec', '-i', info.containerName, 'psql', '-U', info.user, '-d', info.database, '-v', 'ON_ERROR_STOP=1'],
    { input: sql },
  )
  if (r.code !== 0) throw new Error(`psql failed: ${r.stderr || r.stdout}`)
}

export async function dumpSchemaSql(info: ShadowInfo): Promise<string> {
  const r = await run('docker', [
    'exec',
    info.containerName,
    'pg_dump',
    '-U',
    info.user,
    '-d',
    info.database,
    '--schema-only',
  ])
  if (r.code !== 0) throw new Error(`pg_dump failed: ${r.stderr || r.stdout}`)
  return r.stdout
}

/** Clone schema from an external source URL into the shadow (read-only dump phase). */
export async function cloneFromSource(info: ShadowInfo, sourceUrl: string): Promise<void> {
  // Use local pg_dump if available against source; else instruct fixture path.
  const dump = await run('pg_dump', ['--schema-only', sourceUrl])
  if (dump.code !== 0) {
    throw new Error(`pg_dump source failed (is pg_dump installed?): ${dump.stderr}`)
  }
  await execSqlInContainer(info, dump.stdout)
}
