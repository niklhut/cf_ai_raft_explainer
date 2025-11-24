<script setup lang="ts">
const tokenCookie = useCookie('turnstile_token')
const token = ref<string | undefined>(tokenCookie.value || undefined)

watch(token, (newToken) => {
  tokenCookie.value = newToken
})
</script>

<template>
  <UApp>
    <NuxtLoadingIndicator />

    <ClientOnly>
      <div v-if="!token" class="flex flex-col items-center justify-center h-screen gap-4">
        <h1 class="text-2xl font-bold">Security Check</h1>
        <p>Please complete the security check to access the application.</p>
        <NuxtTurnstile v-model="token" />
      </div>

      <NuxtPage v-else />

      <template #fallback>
        <div class="flex items-center justify-center h-screen">
          <UIcon name="i-heroicons-arrow-path" class="animate-spin w-8 h-8 text-gray-400" />
        </div>
      </template>
    </ClientOnly>
  </UApp>
</template>
