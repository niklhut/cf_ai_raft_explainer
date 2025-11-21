<script setup lang="ts">
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import type { ChatMessage } from '@raft-simulator/shared'

const props = defineProps<{
  history: ChatMessage[]
  loading: boolean
  streamingMessage?: string | null
  optimisticUserMessage?: string | null
}>()

const emit = defineEmits<{
  (e: 'send', message: string): void,
}>()

const input = ref('')

const messages = computed(() => {
  const msgs = props.history.map((m, i) => ({
    id: `history-${i}`,
    role: m.role,
    parts: [{ type: 'text', text: m.content }]
  }))

  // Deduplication logic:
  const lastMsg = msgs[msgs.length - 1]
  const lastIsUser = lastMsg?.role === 'user'
  const lastIsAssistant = lastMsg?.role === 'assistant'

  if (props.optimisticUserMessage) {
    const isDuplicate = lastIsUser && lastMsg?.parts[0]?.type === 'text' && lastMsg.parts[0].text === props.optimisticUserMessage
    if (!isDuplicate) {
      msgs.push({
        id: 'optimistic-user',
        role: 'user',
        parts: [{ type: 'text', text: props.optimisticUserMessage }]
      })
    }
  }

  if (props.streamingMessage) {
    const isDuplicate = lastIsAssistant && lastMsg?.parts[0]?.type === 'text' && lastMsg.parts[0].text.startsWith(props.streamingMessage)
    if (!isDuplicate) {
      msgs.push({
        id: 'streaming-assistant',
        role: 'assistant',
        parts: [{ type: 'text', text: props.streamingMessage }]
      })
    }
  }

  return msgs as any // Cast to any to avoid strict type checking for UIMessage which is complex
})

const status = computed(() => {
  if (props.loading) {
    return props.streamingMessage ? 'streaming' : 'submitted'
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
      }" />
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