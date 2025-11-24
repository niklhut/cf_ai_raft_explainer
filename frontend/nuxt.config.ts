// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    "@nuxt/ui",
    "@pinia/nuxt",
    "pinia-plugin-persistedstate/nuxt",
    "@nuxtjs/mdc",
    "@nuxtjs/turnstile",
  ],
  turnstile: {
    siteKey:
      process.env.NUXT_PUBLIC_TURNSTILE_SITE_KEY || "1x00000000000000000000AA",
  },
  compatibilityDate: "2025-07-15",
  ssr: false,
  devtools: { enabled: true },
  css: ["~/assets/css/main.css"],
  runtimeConfig: {
    public: {
      apiBase: "http://localhost:8787/api",
    },
  },
})
