export function useApi() {
  const config = useRuntimeConfig();

  return {
    get: (url: string) => $fetch(config.public.apiBase + url),
    post: (url: string, body: any) => $fetch(config.public.apiBase + url, {
      method: "POST",
      body
    })
  };
}
