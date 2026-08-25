import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import postgres from 'postgres'

const databaseUrl = process.env.CITYOS_DATABASE_URL
  ?? 'postgres://cityos:cityos_dev@127.0.0.1:55432/cityos'
const seedsDir = path.resolve('services/postgres/seeds')
const sql = postgres(databaseUrl, { max: 1 })

try {
  const files = (await readdir(seedsDir))
    .filter((name) => name.endsWith('.sql'))
    .sort()

  for (const filename of files) {
    const source = await readFile(path.join(seedsDir, filename), 'utf8')
    await sql.begin((transaction) => transaction.unsafe(source))
    console.log(`seeded ${filename}`)
  }
} finally {
  await sql.end()
}
