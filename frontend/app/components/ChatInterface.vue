<script setup lang="ts">
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import type { UIMessage } from 'ai'
import { getTextFromMessage } from '@nuxt/ui/utils/ai'

const props = defineProps<{
  messages: UIMessage[]
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'send', message: string): void,
}>()

const input = ref('')

const status = computed(() => {
  if (props.loading) {
    // We can't easily distinguish streaming vs submitted without more props, 
    // but if the last message is assistant and loading, maybe streaming?
    // For now, let's just say 'submitted' if loading.
    // Or we can keep passing streaming status if needed.
    return 'submitted'
  }
  return 'ready'
})

const onSubmit = () => {
  if (!input.value.trim() || props.loading) return
  emit('send', input.value)
  input.value = ''
}

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('lg')
</script>

<template>
  <UDashboardPanel id="chat-panel">
    <template #header v-if="!isMobile">
      <UDashboardNavbar title="Interactive Assistant" />
    </template>

    <template #body>
      <UChatMessages :messages="messages" :status="status" :should-auto-scroll="true" :assistant="{
        variant: 'naked'
      }">
        <template #content="{ message }">
          <MDC :value="getTextFromMessage(message)" :cache-key="message.id" class="*:first:mt-0 *:last:mb-0" />
        </template>
      </UChatMessages>
    </template>

    <template #footer>
      <UContainer class="pb-2 sm:pb-3">
        <UChatPrompt v-model="input" :loading="loading" placeholder="Type a command (e.g., 'fail leader')..."
          @submit="onSubmit">
          <UChatPromptSubmit :status="status" />
        </UChatPrompt>
      </UContainer>
    </template>
  </UDashboardPanel>
</template>