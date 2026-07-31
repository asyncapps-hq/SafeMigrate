import type { Finding, Grade, Severity } from './types.js'

const rank: Record<Severity, number> = {
  safe: 0,
  caution: 1,
  destructive: 2,
  irreversible: 3,
}

export function gradeFromFindings(findings: Finding[]): Grade {
  const irreversible = findings.filter((f) => f.severity === 'irreversible').length
  const destructive = findings.filter((f) => f.severity === 'destructive').length
  const caution = findings.filter((f) => f.severity === 'caution').length
  if (irreversible > 0 || destructive >= 3) return 'F'
  if (destructive >= 1) return 'D'
  if (caution >= 3) return 'C'
  if (caution >= 1) return 'B'
  return 'A'
}

export function shouldFail(
  findings: Finding[],
  failOn: Severity | 'never' | undefined,
  allowDestructive?: boolean,
): boolean {
  if (!failOn || failOn === 'never') return false
  if (allowDestructive && (failOn === 'destructive' || failOn === 'irreversible')) {
    // still fail on irreversible unless explicitly never
    return findings.some((f) => f.severity === 'irreversible')
  }
  const min = rank[failOn]
  return findings.some((f) => rank[f.severity] >= min)
}

export const DISCLAIMER =
  'SafeMigrate analyzes **schema structure** only. It does not simulate lock duration or data-volume rewrite cost under production load.'
