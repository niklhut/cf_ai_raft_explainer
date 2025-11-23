<script setup lang="ts">
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { getTextFromMessage } from '@nuxt/ui/utils/ai'
import type { Chat } from "@ai-sdk/vue"
import type { UIMessage } from "ai"

const props = defineProps<{
  chat: Chat<UIMessage>
}>()

onMounted(() => {
  console.log("ChatInterface Chat:", props.chat)
})

const emit = defineEmits<{
  (e: 'send', message: string): void,
}>()

const input = ref('')

const onSubmit = () => {
  if (!input.value.trim() || props.chat.status === 'streaming') return
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
        <UChatPrompt v-model="input" placeholder="Type a command (e.g., 'fail leader')..."
          @submit="onSubmit">
          <UChatPromptSubmit :status="chat.status" @stop="chat.stop" />
        </UChatPrompt>
      </UContainer>
    </template>
  </UDashboardPanel>
</template>