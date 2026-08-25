import { handleCityChatRequest } from '../server/chat-core.js'

declare const process: {
  env: Record<string, string | undefined>
}

export default {
  fetch(request: Request) {
    return handleCityChatRequest(request, process.env)
  },
}
