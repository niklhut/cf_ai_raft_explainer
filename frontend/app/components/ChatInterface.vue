<script setup lang="ts">
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { getTextFromMessage } from '@nuxt/ui/utils/ai'
import { Chat } from '@ai-sdk/vue'
import { DefaultChatTransport, TextStreamChatTransport, type UIMessage } from "ai"

const config = useRuntimeConfig()

const clusterStore = useClusterStore()
const { clusterState } = storeToRefs(clusterStore)

const input = ref("")

const chat = shallowRef<Chat<UIMessage>>(new Chat({}))

watch(clusterState, (state) => {
  if (!state?.id) return

  const t = new DefaultChatTransport({
    api: `${config.public.apiBase}/chat/${state.id}`,
  })

  chat.value = new Chat({
    transport: t,
    messages: state.chatHistory ?? [],
  })
}, { immediate: true })

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
        </UChatPrompt>
      </UContainer>
    </template>
  </UDashboardPanel>
</template>
