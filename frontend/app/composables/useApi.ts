export function useApi() {
  const config = useRuntimeConfig()
  const turnstileToken = useCookie("turnstile_token")

  return {
    get: (url: string) =>
      $fetch(config.public.apiBase + url, {
        headers: {
          "x-turnstile-token": turnstileToken.value || "",
        },
      }),
    post: (url: string, body: any) =>
      $fetch(config.public.apiBase + url, {
        method: "POST",
        body,
        headers: {
          "x-turnstile-token": turnstileToken.value || "",
        },
      }),
  }
}
