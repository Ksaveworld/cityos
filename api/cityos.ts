import { waitUntil } from '@vercel/functions'

import { getCityosDatabase } from '../server/cityos/db.js'
import { handleCityosRequest } from '../server/cityos/http.js'
import { createCityosServerlessHandler } from '../server/cityos/serverless.js'
import { createSimulatedMedicalAdapter, drainMedicalOutbox } from '../server/cityos/worker.js'

declare const process: {
  env: Record<string, string | undefined>
}

const env = process.env
const fetch = createCityosServerlessHandler({
  env,
  handleRequest: handleCityosRequest,
  drainOutbox: () => drainMedicalOutbox(
    getCityosDatabase(env),
    createSimulatedMedicalAdapter(env),
    { limit: 10 },
  ),
  waitUntil,
  onDrainError: (error) => {
    console.error('[cityos] serverless outbox drain 失败', error)
  },
})

export default { fetch }
