export function useApi() {
  const config = useRuntimeConfig()
  const { getSessionToken } = useAuth()

  const getHeaders = async () => {
    const token = await getSessionToken()
    return {
      Authorization: token ? `Bearer ${token}` : "",
    }
  }

  return {
    get: async (url: string) =>
      $fetch(config.public.apiBase + url, {
        headers: await getHeaders(),
      }),
    post: async (url: string, body: any) =>
      $fetch(config.public.apiBase + url, {
        method: "POST",
        body,
        headers: await getHeaders(),
      }),
  }
}
