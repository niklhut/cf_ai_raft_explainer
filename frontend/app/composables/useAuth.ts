export function useAuth() {
  const config = useRuntimeConfig()
  const turnstileToken = useCookie("turnstile_token")
  const sessionToken = useCookie("session_token", {
    maxAge: 60 * 60 * 24, // 24 hours
  })

  const getSessionToken = async () => {
    if (sessionToken.value) {
      return sessionToken.value
    }

    if (!turnstileToken.value) {
      // If we don't have a turnstile token, we can't authenticate.
      // The user might need to complete the turnstile challenge.
      return null
    }

    try {
      const response = await $fetch<{ token: string }>(
        `${config.public.apiBase}/auth/verify`,
        {
          method: "POST",
          body: { token: turnstileToken.value },
        },
      )

      sessionToken.value = response.token
      return response.token
    } catch (error) {
      console.error("Failed to verify turnstile token:", error)
      return null
    }
  }

  return {
    getSessionToken,
  }
}
