import { readFile } from 'node:fs/promises'
import path from 'node:path'
import yaml from 'js-yaml'
import type { PolicyConfig } from './types.js'

export const DEFAULT_POLICY: PolicyConfig = {
  failOn: 'destructive',
  allowDestructive: false,
  requireExpandContract: true,
  ignoredTables: [],
  shadowPort: 55432,
  postgresImage: 'postgres:16-alpine',
  seed: true,
}

export function mergePolicy(...parts: Array<Partial<PolicyConfig> | undefined>): PolicyConfig {
  const base = { ...DEFAULT_POLICY, ignoredTables: [...(DEFAULT_POLICY.ignoredTables ?? [])] }
  for (const p of parts) {
    if (!p) continue
    Object.assign(base, p)
    if (p.ignoredTables) base.ignoredTables = p.ignoredTables
  }
  return base
}

export async function loadPolicy(cwd: string, file = '.safemigrate.yml'): Promise<PolicyConfig> {
  try {
    const raw = await readFile(path.join(cwd, file), 'utf8')
    const parsed = yaml.load(raw) as Record<string, unknown> | null
    if (!parsed || typeof parsed !== 'object') return mergePolicy()
    return mergePolicy({
      failOn: (parsed['fail-on'] as PolicyConfig['failOn']) ?? (parsed.failOn as PolicyConfig['failOn']),
      allowDestructive:
        (parsed['allow-destructive'] as boolean) ?? (parsed.allowDestructive as boolean),
      requireExpandContract:
        (parsed['require-expand-contract'] as boolean) ?? (parsed.requireExpandContract as boolean),
      ignoredTables:
        (parsed['ignored-tables'] as string[]) ?? (parsed.ignoredTables as string[]),
      shadowPort: (parsed['shadow-port'] as number) ?? (parsed.shadowPort as number),
      postgresImage:
        (parsed['postgres-image'] as string) ?? (parsed.postgresImage as string),
      seed: (parsed.seed as boolean | string) ?? true,
    })
  } catch {
    return mergePolicy()
  }
}
