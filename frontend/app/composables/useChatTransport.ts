import { DefaultChatTransport } from "ai"

export function useChatTransport(sessionId: string) {
  const config = useRuntimeConfig()
  const { getSessionToken } = useAuth()
  const { model } = useModels()

  const transport = new DefaultChatTransport({
    api: `${config.public.apiBase}/chat/${sessionId}`,

    fetch: async (input, init: RequestInit = {}) => {
      const token = await getSessionToken()
      init.headers = {
        ...(init.headers || {}),
        Authorization: token ? `Bearer ${token}` : "",
      }

      if (init.method === "POST" && init.body) {
        const body = JSON.parse(init.body as string)
        body.model = model.value
        init.body = JSON.stringify(body)
      }

      return fetch(input, init)
    },
  })

  return transport
}
