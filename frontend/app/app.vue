<script setup lang="ts">
const tokenCookie = useCookie('turnstile_token', {
  default: () => undefined as string | undefined,
  watch: true
})
</script>

<template>
  <UApp :toaster="{ position: 'top-right' }">
    <NuxtLoadingIndicator />

    <ClientOnly>
      <div v-if="!tokenCookie" class="flex flex-col items-center justify-center h-screen gap-4">
        <h1 class="text-2xl font-bold">Security Check</h1>
        <p>Please complete the security check to access the application.</p>
        <NuxtTurnstile v-model="tokenCookie" />
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
