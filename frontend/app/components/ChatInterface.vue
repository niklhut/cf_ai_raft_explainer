<script setup lang="ts">
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { getTextFromMessage } from '@nuxt/ui/utils/ai'
import { Chat } from '@ai-sdk/vue'
import type { UIMessage } from "ai"

const props = defineProps<{
  sessionId: string
  initialMessages: UIMessage[]
}>()

const config = useRuntimeConfig()

const { messages, input, handleSubmit, status, stop, setMessages } = useChat({
  api: `${config.public.apiBase}/chat/${props.sessionId}`,
  initialMessages: props.initialMessages,
})

// Sync messages from props (WS updates)
watch(() => props.initialMessages, (newMessages) => {
  if (newMessages && newMessages.length > messages.value.length) {
    setMessages(newMessages)
  }
}, { deep: true })

const emit = defineEmits<{
  (e: 'send', message: string): void,
}>()

const onSubmit = (e: Event) => {
  if (!input.value.trim() || status.value === 'streaming') return
  handleSubmit(e)
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
        <!-- <template #content="{ message }">
          <MDC :value="getTextFromMessage(message)" :cache-key="message.id" class="*:first:mt-0 *:last:mb-0" />
        </template> -->
      </UChatMessages>
    </template>

    <template #footer>
      <UContainer class="pb-2 sm:pb-3">
        <UChatPrompt v-model="input" placeholder="Type a command (e.g., 'fail leader')..."
          @submit="onSubmit">
          <UChatPromptSubmit :status="status" @stop="stop" />
        </UChatPrompt>
      </UContainer>
    </template>
  </UDashboardPanel>
</template>
