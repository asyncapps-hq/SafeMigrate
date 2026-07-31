export const PRODUCT = 'SafeMigrate'
export const AUTHOR = 'KhyFee'

export type Severity = 'safe' | 'caution' | 'destructive' | 'irreversible'
export type Grade = 'A' | 'B' | 'C' | 'D' | 'F'
export type FindingSource = 'structural' | 'statement'

export interface ColumnDef {
  table: string
  name: string
  dataType: string
  udtName: string
  isNullable: boolean
  columnDefault: string | null
  ordinal: number
}

export interface TableDef {
  name: string
  columns: ColumnDef[]
  primaryKey: string[]
}

export interface IndexDef {
  name: string
  table: string
  definition: string
  isUnique: boolean
}

export interface FkDef {
  name: string
  table: string
  column: string
  refTable: string
  refColumn: string
}

export interface CatalogSnapshot {
  tables: TableDef[]
  indexes: IndexDef[]
  foreignKeys: FkDef[]
  views: string[]
  enums: Array<{ name: string; values: string[] }>
}

export interface DiffChange {
  kind:
    | 'table_added'
    | 'table_dropped'
    | 'column_added'
    | 'column_dropped'
    | 'column_changed'
    | 'index_added'
    | 'index_dropped'
    | 'fk_added'
    | 'fk_dropped'
    | 'enum_changed'
    | 'view_added'
    | 'view_dropped'
  severity: Severity
  object: string
  detail: string
  before?: unknown
  after?: unknown
}

export interface LintFinding {
  source: 'statement'
  severity: Severity
  ruleId: string
  message: string
  file?: string
  hint?: string
}

export interface StructuralFinding {
  source: 'structural'
  severity: Severity
  ruleId: string
  message: string
  change: DiffChange
}

export type Finding = LintFinding | StructuralFinding

export interface DiffResult {
  changes: DiffChange[]
  findings: Finding[]
  grade: Grade
}

export interface PolicyConfig {
  failOn?: Severity | 'never'
  allowDestructive?: boolean
  requireExpandContract?: boolean
  ignoredTables?: string[]
  shadowPort?: number
  postgresImage?: string
  seed?: string | boolean
}

export interface VerifyResult {
  ok: boolean
  mismatches: string[]
  seedOk?: boolean
}

export interface TimelineEntry {
  migration: string
  grade: Grade
  destructiveCount: number
  changes: DiffChange[]
}
