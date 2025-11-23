<script setup lang="ts">
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { getTextFromMessage } from '@nuxt/ui/utils/ai'
import { Chat } from '@ai-sdk/vue'
import { TextStreamChatTransport, type UIMessage } from "ai"

const props = defineProps<{
  sessionId: string
  initialMessages: UIMessage[]
}>()

const input = ref('')

const config = useRuntimeConfig()

const chat = new Chat({
  messages: props.initialMessages,
  transport: new TextStreamChatTransport({
    api: `${config.public.apiBase}/chat/${props.sessionId}`,
  }),
})

// Sync messages from props (WS updates)
watch(() => props.initialMessages, (newMessages) => {
  if (newMessages && newMessages.length > chat.messages.length) {
    chat.messages = newMessages
  }
}, { deep: true })

const emit = defineEmits<{
  (e: 'send', message: string): void,
}>()

const onSubmit = (e: Event) => {
  const trimmed = input.value.trim()
  if (!trimmed || chat.status === 'streaming') return
  chat.sendMessage({ text: trimmed })
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
      <UChatMessages :messages="chat.messages" :status="chat.status" :should-auto-scroll="true" :assistant="{
        variant: 'naked'
      }">
        <!-- <template #content="{ message }">
          <MDC :value="getTextFromMessage(message)" :cache-key="message.id" class="*:first:mt-0 *:last:mb-0" />
        </template> -->
      </UChatMessages>
    </template>

    <template #footer>
      <UContainer class="pb-2 sm:pb-3">
        <UChatPrompt v-model="input" placeholder="Type a command (e.g., 'fail leader')..." @submit="onSubmit">
          <UChatPromptSubmit :status="chat.status" @stop="chat.stop" />
        </UChatPrompt>
      </UContainer>
    </template>
  </UDashboardPanel>
</template>
