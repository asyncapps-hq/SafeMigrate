import { DISCLAIMER } from './risk.js'
import type { DiffResult, Finding, TimelineEntry, VerifyResult } from './types.js'
import { AUTHOR, PRODUCT } from './types.js'

export function renderDiffMarkdown(diff: DiffResult): string {
  const lines = [
    `# ${PRODUCT} schema diff`,
    '',
    `**Grade:** ${diff.grade}`,
    '',
    DISCLAIMER,
    '',
    '| Severity | Kind | Object | Detail |',
    '|---|---|---|---|',
  ]
  for (const c of diff.changes) {
    lines.push(`| ${c.severity} | ${c.kind} | \`${c.object}\` | ${c.detail} |`)
  }
  if (!diff.changes.length) lines.push('| — | — | — | No structural changes |')
  lines.push('', `_${AUTHOR}_`, '')
  return lines.join('\n')
}

export function renderReportMarkdown(opts: {
  diff: DiffResult
  findings: Finding[]
  verify?: VerifyResult
  timeline?: TimelineEntry[]
}): string {
  const lines = [
    `# ${PRODUCT} risk report`,
    '',
    `**Grade:** ${opts.diff.grade}`,
    '',
    DISCLAIMER,
    '',
    '## Findings',
    '',
  ]
  for (const f of opts.findings) {
    lines.push(`- **${f.severity}** \`${f.ruleId}\` (${f.source}): ${f.message}`)
  }
  if (opts.verify) {
    lines.push('', '## Verify rollback', '', opts.verify.ok ? 'PASS' : 'FAIL')
    for (const m of opts.verify.mismatches) lines.push(`- ${m}`)
  }
  if (opts.timeline?.length) {
    lines.push('', '## Timeline', '')
    for (const t of opts.timeline) {
      lines.push(`- \`${t.migration}\` grade=${t.grade} destructive=${t.destructiveCount}`)
    }
  }
  lines.push('', `_By ${AUTHOR}_`, '')
  return lines.join('\n')
}
