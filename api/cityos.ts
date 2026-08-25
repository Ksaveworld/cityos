import { handleCityosRequest } from '../server/cityos/http.js'

declare const process: {
  env: Record<string, string | undefined>
}

export default {
  fetch(request: Request) {
    return handleCityosRequest(request, process.env)
  },
}
