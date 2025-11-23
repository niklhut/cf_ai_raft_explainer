<script setup lang="ts">
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { getTextFromMessage } from '@nuxt/ui/utils/ai'
import { Chat } from '@ai-sdk/vue'
import { TextStreamChatTransport, type UIMessage } from "ai"

const props = defineProps<{
  sessionId: string
  initialMessages: UIMessage[]
}>()

console.log("initialMessages for session", props.sessionId, props.initialMessages)

const input = ref('')
const config = useRuntimeConfig()

const transport = new TextStreamChatTransport({
  api: `${config.public.apiBase}/chat/${props.sessionId}`,
})

const chat = reactive<Chat<UIMessage>>(new Chat({ messages: props.initialMessages, transport }))

const onSubmit = (e: Event) => {
  const trimmed = input.value.trim()
  if (!trimmed || chat.status === 'streaming') return
  chat.sendMessage({ text: trimmed })
  input.value = ''
}

watch(() => props.initialMessages, (newMessages) => {
  chat.messages = newMessages
  console.log("Updated chat messages:", chat.messages)
})

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('lg')
</script>

<template>
  <UDashboardPanel id="chat-panel">
    <template #header v-if="!isMobile">
      <UDashboardNavbar title="Interactive Assistant" />
    </template>

    <template #body>
      <!-- {{ initialMessages }} -->
      <!-- {{ chat.messages }} -->
      <UChatMessages v-if="chat" :messages="chat.messages" :status="chat.status" :should-auto-scroll="true" :assistant="{
        variant: 'naked'
      }">
        <template #content="{ message }">
          {{ message }}
          <div v-if="message.role === 'user'">
            {{ getTextFromMessage(message) }}
          </div>
          <div v-else>
            <MDC :value="getTextFromMessage(message)" :cache-key="message.id" class="*:first:mt-0 *:last:mb-0" />
          </div>
        </template>
      </UChatMessages>
    </template>

    <template #footer>
      <UContainer class="pb-2 sm:pb-3">
        <UChatPrompt v-model="input" placeholder="Type a command (e.g., 'fail leader')..." @submit="onSubmit">
          <UChatPromptSubmit v-if="chat" :status="chat.status" @stop="chat.stop" />
        </UChatPrompt>
      </UContainer>
    </template>
  </UDashboardPanel>
</template>
