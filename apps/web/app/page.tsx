import { readFile } from 'node:fs/promises'
import path from 'node:path'

type Change = { severity: string; kind: string; object: string; detail: string }
type Diff = { grade?: string; changes?: Change[] }
type Timeline = Array<{ migration: string; grade: string; destructiveCount: number }>

async function loadJson<T>(candidates: string[]): Promise<T | null> {
  for (const p of candidates) {
    try {
      return JSON.parse(await readFile(p, 'utf8')) as T
    } catch {
      /* next */
    }
  }
  return null
}

async function loadText(candidates: string[]): Promise<string | null> {
  for (const p of candidates) {
    try {
      return await readFile(p, 'utf8')
    } catch {
      /* next */
    }
  }
  return null
}

export default async function Page() {
  const rootCandidates = [
    path.resolve(process.cwd(), '../../.safemigrate'),
    path.resolve(process.cwd(), '.safemigrate'),
  ]
  const diff = await loadJson<Diff>(rootCandidates.map((r) => path.join(r, 'diff.json')))
  const timeline = await loadJson<Timeline>(rootCandidates.map((r) => path.join(r, 'timeline.json')))
  const rollback = await loadText(rootCandidates.map((r) => path.join(r, 'ROLLBACK.sql')))
  const changes = diff?.changes?.slice(0, 30) ?? []
  const destructive = changes.filter((c) => c.severity === 'destructive' || c.severity === 'irreversible').length

  return (
    <main>
      <h1 className="brand">SafeMigrate</h1>
      <p className="lead">
        Shadow-test Postgres migrations in Docker. Catch destructive schema changes and generate rollback SQL before production.
      </p>
      <div className="grade">{diff?.grade ?? '—'}</div>
      <p className="lead">Destructive findings: {destructive}</p>

      <table>
        <thead>
          <tr>
            <th>Severity</th>
            <th>Kind</th>
            <th>Object</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {changes.length === 0 ? (
            <tr>
              <td colSpan={4}>Run <code>npm run demo</code> to generate artifacts.</td>
            </tr>
          ) : (
            changes.map((c) => (
              <tr key={c.kind + c.object}>
                <td className={`sev-${c.severity}`}>{c.severity}</td>
                <td><code>{c.kind}</code></td>
                <td><code>{c.object}</code></td>
                <td>{c.detail}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {timeline?.length ? (
        <>
          <h2 style={{ fontFamily: 'var(--font-display)', marginTop: '2.5rem' }}>Timeline</h2>
          <ul>
            {timeline.map((t) => (
              <li key={t.migration}>
                <code>{t.migration}</code> — grade {t.grade}, destructive {t.destructiveCount}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {rollback ? (
        <>
          <h2 style={{ fontFamily: 'var(--font-display)', marginTop: '2.5rem' }}>Rollback preview</h2>
          <pre className="rollback">{rollback.slice(0, 2500)}</pre>
        </>
      ) : null}
    </main>
  )
}
