import type { CatalogSnapshot, ColumnDef, TableDef } from './types.js'

export function emptyCatalog(): CatalogSnapshot {
  return { tables: [], indexes: [], foreignKeys: [], views: [], enums: [] }
}

export function tableMap(c: CatalogSnapshot): Map<string, TableDef> {
  return new Map(c.tables.map((t) => [t.name, t]))
}

export function columnKey(col: ColumnDef): string {
  return `${col.table}.${col.name}`
}

export function normalizeType(col: ColumnDef): string {
  return `${col.udtName}|${col.isNullable ? 'null' : 'notnull'}|${col.columnDefault ?? ''}`
}

/** Build a minimal catalog from declarative fixtures (unit tests / offline). */
export function catalogFromTables(
  tables: Array<{
    name: string
    columns: Array<{
      name: string
      dataType?: string
      udtName?: string
      isNullable?: boolean
      columnDefault?: string | null
    }>
    primaryKey?: string[]
  }>,
  extras?: Partial<CatalogSnapshot>,
): CatalogSnapshot {
  return {
    tables: tables.map((t) => ({
      name: t.name,
      primaryKey: t.primaryKey ?? [],
      columns: t.columns.map((c, i) => ({
        table: t.name,
        name: c.name,
        dataType: c.dataType ?? c.udtName ?? 'text',
        udtName: c.udtName ?? c.dataType ?? 'text',
        isNullable: c.isNullable ?? true,
        columnDefault: c.columnDefault ?? null,
        ordinal: i + 1,
      })),
    })),
    indexes: extras?.indexes ?? [],
    foreignKeys: extras?.foreignKeys ?? [],
    views: extras?.views ?? [],
    enums: extras?.enums ?? [],
  }
}
