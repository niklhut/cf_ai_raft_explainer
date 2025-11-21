<script setup lang="ts">
import type { ChatMessage } from '@raft-simulator/shared'

const props = defineProps<{
  history: ChatMessage[]
  loading: boolean
  streamingMessage?: string | null
  optimisticUserMessage?: string | null
}>()

const emit = defineEmits<{
  (e: 'send', message: string): void
}>()

const input = ref('')
const chatContainer = ref<HTMLElement | null>(null)

const sendMessage = () => {
  if (!input.value.trim() || props.loading) return
  emit('send', input.value)
  input.value = ''
}

// Auto-scroll to bottom
watch(() => [props.history.length, props.streamingMessage, props.optimisticUserMessage], async () => {
  await nextTick()
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight
  }
})
</script>

<template>
  <div class="flex flex-col h-full">
    <div ref="chatContainer" class="flex-1 overflow-y-auto p-4 space-y-4">
      <div v-for="(msg, idx) in history" :key="idx" class="flex"
        :class="msg.role === 'user' ? 'justify-end' : 'justify-start'">
        <div class="max-w-[80%] rounded-lg p-3"
          :class="msg.role === 'user' ? 'bg-primary-500 text-white' : 'bg-gray-100 dark:bg-gray-800'">
          <div class="text-xs opacity-70 mb-1">{{ msg.role === 'user' ? 'You' : 'Raft AI' }}</div>
          <div>{{ msg.content }}</div>
        </div>
      </div>

      <div v-if="optimisticUserMessage" class="flex justify-end">
        <div class="max-w-[80%] rounded-lg p-3 bg-primary-500 text-white">
          <div class="text-xs opacity-70 mb-1">You</div>
          <div>{{ optimisticUserMessage }}</div>
        </div>
      </div>

      <div v-if="streamingMessage" class="flex justify-start">
        <div class="max-w-[80%] rounded-lg p-3 bg-gray-100 dark:bg-gray-800">
          <div class="text-xs opacity-70 mb-1">Raft AI</div>
          <div class="whitespace-pre-wrap">{{ streamingMessage }}</div>
        </div>
      </div>

      <div v-if="loading && !streamingMessage" class="flex justify-start">
        <div class="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 flex items-center space-x-2">
          <UIcon name="i-heroicons-ellipsis-horizontal" class="animate-pulse" />
          <span class="text-sm text-gray-500">Thinking...</span>
        </div>
      </div>
    </div>

    <div class="p-4 border-t border-gray-200 dark:border-gray-700">
      <UChatPrompt v-model="input" placeholder="Type a command (e.g., 'fail leader', 'set x to 10')..." class="flex-1"
        :disabled="loading" autofocus @submit.prevent="sendMessage">
        <UChatPromptSubmit color="primary" />
      </UChatPrompt>
    </div>
  </div>
</template>
