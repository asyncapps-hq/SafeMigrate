import { diffCatalogs } from './diff.js'
import type { CatalogSnapshot, VerifyResult } from './types.js'

/** Compare restored catalog to before; list structural mismatches. */
export function verifyAgainstBefore(before: CatalogSnapshot, restored: CatalogSnapshot): VerifyResult {
  const d = diffCatalogs(before, restored)
  const mismatches = d.changes.map((c) => c.detail)
  return { ok: mismatches.length === 0, mismatches }
}
