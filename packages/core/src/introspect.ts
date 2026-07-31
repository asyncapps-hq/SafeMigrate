import pg from 'pg'
import type { CatalogSnapshot, ColumnDef, FkDef, IndexDef, TableDef } from './types.js'

export async function introspectCatalog(connectionString: string): Promise<CatalogSnapshot> {
  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    const tablesRes = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
    )
    const colsRes = await client.query<{
      table_name: string
      column_name: string
      data_type: string
      udt_name: string
      is_nullable: string
      column_default: string | null
      ordinal_position: number
    }>(
      `SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default, ordinal_position
       FROM information_schema.columns
       WHERE table_schema = 'public'
       ORDER BY table_name, ordinal_position`,
    )
    const pkRes = await client.query<{ table_name: string; column_name: string }>(
      `SELECT tc.table_name, kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
       ORDER BY tc.table_name, kcu.ordinal_position`,
    )
    const idxRes = await client.query<{ indexname: string; tablename: string; indexdef: string }>(
      `SELECT indexname, tablename, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname`,
    )
    const fkRes = await client.query<{
      constraint_name: string
      table_name: string
      column_name: string
      foreign_table_name: string
      foreign_column_name: string
    }>(
      `SELECT
         tc.constraint_name,
         tc.table_name,
         kcu.column_name,
         ccu.table_name AS foreign_table_name,
         ccu.column_name AS foreign_column_name
       FROM information_schema.table_constraints AS tc
       JOIN information_schema.key_column_usage AS kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage AS ccu
         ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`,
    )
    const viewsRes = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.views WHERE table_schema = 'public' ORDER BY table_name`,
    )
    const enumsRes = await client.query<{ typname: string; enumlabel: string }>(
      `SELECT t.typname, e.enumlabel
       FROM pg_type t
       JOIN pg_enum e ON t.oid = e.enumtypid
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public'
       ORDER BY t.typname, e.enumsortorder`,
    )

    const pkMap = new Map<string, string[]>()
    for (const r of pkRes.rows) {
      const list = pkMap.get(r.table_name) ?? []
      list.push(r.column_name)
      pkMap.set(r.table_name, list)
    }

    const colsByTable = new Map<string, ColumnDef[]>()
    for (const r of colsRes.rows) {
      const list = colsByTable.get(r.table_name) ?? []
      list.push({
        table: r.table_name,
        name: r.column_name,
        dataType: r.data_type,
        udtName: r.udt_name,
        isNullable: r.is_nullable === 'YES',
        columnDefault: r.column_default,
        ordinal: r.ordinal_position,
      })
      colsByTable.set(r.table_name, list)
    }

    const tables: TableDef[] = tablesRes.rows.map((t) => ({
      name: t.table_name,
      columns: colsByTable.get(t.table_name) ?? [],
      primaryKey: pkMap.get(t.table_name) ?? [],
    }))

    const indexes: IndexDef[] = idxRes.rows.map((r) => ({
      name: r.indexname,
      table: r.tablename,
      definition: r.indexdef,
      isUnique: /UNIQUE/i.test(r.indexdef),
    }))

    const foreignKeys: FkDef[] = fkRes.rows.map((r) => ({
      name: r.constraint_name,
      table: r.table_name,
      column: r.column_name,
      refTable: r.foreign_table_name,
      refColumn: r.foreign_column_name,
    }))

    const enumMap = new Map<string, string[]>()
    for (const r of enumsRes.rows) {
      const list = enumMap.get(r.typname) ?? []
      list.push(r.enumlabel)
      enumMap.set(r.typname, list)
    }

    return {
      tables,
      indexes,
      foreignKeys,
      views: viewsRes.rows.map((v) => v.table_name),
      enums: [...enumMap.entries()].map(([name, values]) => ({ name, values })),
    }
  } finally {
    await client.end()
  }
}

export async function execSql(connectionString: string, sql: string): Promise<void> {
  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    await client.query(sql)
  } finally {
    await client.end()
  }
}

export async function seedChecksum(connectionString: string, table = 'users'): Promise<string | null> {
  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    const exists = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
      [table],
    )
    if (!exists.rowCount) return null
    const res = await client.query(`SELECT md5(string_agg(t::text, ',' ORDER BY t::text)) AS c FROM ${table} t`)
    return (res.rows[0]?.c as string) ?? null
  } catch {
    return null
  } finally {
    await client.end()
  }
}
