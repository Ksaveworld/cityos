import postgres from 'postgres'

type Environment = Record<string, string | undefined>
export type CityosDatabase = ReturnType<typeof postgres>

const clients = new Map<string, CityosDatabase>()

export function getCityosDatabase(env: Environment): CityosDatabase {
  const databaseUrl = env.CITYOS_DATABASE_URL?.trim()
  if (!databaseUrl) throw new Error('CITYOS_DATABASE_URL is not configured')
  const existing = clients.get(databaseUrl)
  if (existing) return existing

  const client = postgres(databaseUrl, {
    max: 4,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  })
  clients.set(databaseUrl, client)
  return client
}

export async function closeCityosDatabases() {
  await Promise.all([...clients.values()].map((client) => client.end({ timeout: 2 })))
  clients.clear()
}
