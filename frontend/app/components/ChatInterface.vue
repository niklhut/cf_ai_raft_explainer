<script setup lang="ts">
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { getTextFromMessage } from '@nuxt/ui/utils/ai'
import { Chat } from '@ai-sdk/vue'
import { DefaultChatTransport, type UIMessage } from "ai"

const config = useRuntimeConfig()
const { model } = useModels()

const clusterStore = useClusterStore()
const { clusterState } = storeToRefs(clusterStore)

const input = ref("")

const chat = shallowRef<Chat<UIMessage> | null>(null)
const activeSessionId = ref<string | null>(null)

watch(() => clusterState.value?.id, (sessionId) => {
  if (!sessionId) {
    chat.value = null
    activeSessionId.value = null
    return
  }

  if (sessionId === activeSessionId.value && chat.value) return

  const transport = new DefaultChatTransport({
    api: `${config.public.apiBase}/chat/${sessionId}`,
    fetch: (input, init) => {
      if (init && init.method === "POST" && init.body) {
        const body = JSON.parse(init.body as string)
        body.model = model.value
        init.body = JSON.stringify(body)
      }
      return fetch(input, init)
    }
  })

  chat.value = new Chat({
    transport,
    messages: clusterState.value?.chatHistory ?? [],
  })

  activeSessionId.value = sessionId
}, { immediate: true })

watch(() => clusterState.value?.chatHistory, (history) => {
  if (!chat.value || !history) return
  if (chat.value.status === "streaming") return

  chat.value.messages = history
})

const onSubmit = () => {
  const trimmed = input.value.trim()
  if (trimmed === "" || !chat.value) return
  chat.value.sendMessage({
    text: trimmed,
  })
  input.value = ""
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
      <UChatMessages v-if="chat" :messages="chat.messages" :status="chat.status">
        <template #content="{ message }">
          <MDC :value="getTextFromMessage(message)" :cache-key="message.id" class="*:first:mt-0 *:last:mb-0" />
        </template>
      </UChatMessages>
    </template>

    <template #footer>
      <UContainer class="pb-2 sm:pb-3">
        <UChatPrompt v-model="input" placeholder="Type a command (e.g., 'fail leader')..." @submit="onSubmit">
          <UChatPromptSubmit v-if="chat" :status="chat.status" @stop="chat.stop" />
          <template #footer>
            <ModelSelect />
          </template>
        </UChatPrompt>
      </UContainer>
    </template>
  </UDashboardPanel>
</template>
