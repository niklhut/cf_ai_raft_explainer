import { DefaultChatTransport } from "ai"

export function useChatTransport(sessionId: string) {
  const config = useRuntimeConfig()
  const turnstileToken = useCookie("turnstile_token")
  const { model } = useModels()

  const transport = new DefaultChatTransport({
    api: `${config.public.apiBase}/chat/${sessionId}`,

    fetch: (input, init: RequestInit = {}) => {
      init.headers = {
        ...(init.headers || {}),
        "x-turnstile-token": turnstileToken.value ?? "",
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
