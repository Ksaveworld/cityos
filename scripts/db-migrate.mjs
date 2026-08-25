import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import postgres from 'postgres'

const databaseUrl = process.env.CITYOS_DATABASE_URL
  ?? 'postgres://cityos:cityos_dev@127.0.0.1:55432/cityos'
const migrationsDir = path.resolve('services/postgres/migrations')
const sql = postgres(databaseUrl, { max: 1 })

try {
  await sql.unsafe(`
    CREATE SCHEMA IF NOT EXISTS cityos;
    CREATE TABLE IF NOT EXISTS cityos.schema_migration (
      filename TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `)

  const files = (await readdir(migrationsDir))
    .filter((name) => name.endsWith('.sql'))
    .sort()

  for (const filename of files) {
    const source = await readFile(path.join(migrationsDir, filename), 'utf8')
    const checksum = createHash('sha256').update(source).digest('hex')
    const [existing] = await sql`
      SELECT checksum FROM cityos.schema_migration WHERE filename = ${filename}
    `
    if (existing) {
      if (existing.checksum !== checksum) {
        throw new Error(`Migration checksum mismatch: ${filename}`)
      }
      console.log(`skip ${filename}`)
      continue
    }

    await sql.begin(async (transaction) => {
      await transaction.unsafe(source)
      await transaction`
        INSERT INTO cityos.schema_migration (filename, checksum)
        VALUES (${filename}, ${checksum})
      `
    })
    console.log(`applied ${filename}`)
  }
} finally {
  await sql.end()
}
