import { columnKey, normalizeType, tableMap } from './catalog-model.js'
import type {
  CatalogSnapshot,
  DiffChange,
  DiffResult,
  Finding,
  Severity,
  StructuralFinding,
} from './types.js'
import { gradeFromFindings } from './risk.js'

function ignored(name: string, ignoredTables?: string[]): boolean {
  return Boolean(ignoredTables?.includes(name))
}

export function diffCatalogs(
  before: CatalogSnapshot,
  after: CatalogSnapshot,
  opts?: { ignoredTables?: string[] },
): DiffResult {
  const changes: DiffChange[] = []
  const beforeTables = tableMap(before)
  const afterTables = tableMap(after)

  for (const [name, t] of afterTables) {
    if (ignored(name, opts?.ignoredTables)) continue
    if (!beforeTables.has(name)) {
      changes.push({
        kind: 'table_added',
        severity: 'safe',
        object: name,
        detail: `Table ${name} added`,
        after: t,
      })
    }
  }
  for (const [name, t] of beforeTables) {
    if (ignored(name, opts?.ignoredTables)) continue
    if (!afterTables.has(name)) {
      changes.push({
        kind: 'table_dropped',
        severity: 'destructive',
        object: name,
        detail: `Table ${name} dropped`,
        before: t,
      })
    }
  }

  for (const [name, bt] of beforeTables) {
    if (ignored(name, opts?.ignoredTables)) continue
    const at = afterTables.get(name)
    if (!at) continue
    const bcols = new Map(bt.columns.map((c) => [c.name, c]))
    const acols = new Map(at.columns.map((c) => [c.name, c]))
    for (const [cn, c] of acols) {
      if (!bcols.has(cn)) {
        changes.push({
          kind: 'column_added',
          severity: c.isNullable || c.columnDefault != null ? 'safe' : 'caution',
          object: columnKey(c),
          detail: `Column ${columnKey(c)} added (${c.udtName})`,
          after: c,
        })
      }
    }
    for (const [cn, c] of bcols) {
      if (!acols.has(cn)) {
        changes.push({
          kind: 'column_dropped',
          severity: 'destructive',
          object: columnKey(c),
          detail: `Column ${columnKey(c)} dropped`,
          before: c,
        })
      } else {
        const a = acols.get(cn)!
        if (normalizeType(c) !== normalizeType(a)) {
          const shrink =
            (!c.isNullable && a.isNullable === false && c.udtName !== a.udtName) ||
            /^(int|int4|integer)$/i.test(c.udtName) && /^(int2|smallint)$/i.test(a.udtName)
          changes.push({
            kind: 'column_changed',
            severity: shrink ? 'destructive' : 'caution',
            object: columnKey(c),
            detail: `Column ${columnKey(c)} changed ${normalizeType(c)} → ${normalizeType(a)}`,
            before: c,
            after: a,
          })
        }
      }
    }
  }

  const bIdx = new Map(before.indexes.map((i) => [i.name, i]))
  const aIdx = new Map(after.indexes.map((i) => [i.name, i]))
  for (const [n, i] of aIdx) {
    if (!bIdx.has(n)) {
      changes.push({
        kind: 'index_added',
        severity: 'safe',
        object: n,
        detail: `Index ${n} added`,
        after: i,
      })
    }
  }
  for (const [n, i] of bIdx) {
    if (!aIdx.has(n)) {
      changes.push({
        kind: 'index_dropped',
        severity: 'caution',
        object: n,
        detail: `Index ${n} dropped`,
        before: i,
      })
    }
  }

  const bFk = new Map(before.foreignKeys.map((f) => [f.name, f]))
  const aFk = new Map(after.foreignKeys.map((f) => [f.name, f]))
  for (const [n, f] of aFk) {
    if (!bFk.has(n)) {
      changes.push({ kind: 'fk_added', severity: 'safe', object: n, detail: `FK ${n} added`, after: f })
    }
  }
  for (const [n, f] of bFk) {
    if (!aFk.has(n)) {
      changes.push({
        kind: 'fk_dropped',
        severity: 'caution',
        object: n,
        detail: `FK ${n} dropped`,
        before: f,
      })
    }
  }

  const bViews = new Set(before.views)
  const aViews = new Set(after.views)
  for (const v of aViews) {
    if (!bViews.has(v)) changes.push({ kind: 'view_added', severity: 'safe', object: v, detail: `View ${v} added` })
  }
  for (const v of bViews) {
    if (!aViews.has(v)) {
      changes.push({ kind: 'view_dropped', severity: 'caution', object: v, detail: `View ${v} dropped` })
    }
  }

  const bEnums = new Map(before.enums.map((e) => [e.name, e.values.join(',')]))
  const aEnums = new Map(after.enums.map((e) => [e.name, e.values.join(',')]))
  for (const [n, bv] of bEnums) {
    const av = aEnums.get(n)
    if (av != null && av !== bv) {
      const lost = bv.split(',').some((x) => !av.split(',').includes(x))
      changes.push({
        kind: 'enum_changed',
        severity: lost ? 'irreversible' : 'caution',
        object: n,
        detail: `Enum ${n} changed`,
        before: bv,
        after: av,
      })
    }
  }

  const findings: Finding[] = changes.map(
    (change): StructuralFinding => ({
      source: 'structural',
      severity: change.severity,
      ruleId: change.kind,
      message: change.detail,
      change,
    }),
  )

  return { changes, findings, grade: gradeFromFindings(findings) }
}

export function maxSeverity(items: Array<{ severity: Severity }>): Severity {
  const rank: Record<Severity, number> = { safe: 0, caution: 1, destructive: 2, irreversible: 3 }
  let best: Severity = 'safe'
  for (const i of items) if (rank[i.severity] > rank[best]) best = i.severity
  return best
}
