<script setup lang="ts">
const { savedSessions, sessionId, createSession, switchSession } = useRaftSession()

const isOpen = ref(false)
</script>

<template>
  <div class="flex flex-col h-full border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 w-64">
    <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
      <h2 class="font-bold text-xl">Raft Sim</h2>
      <UButton 
        icon="i-heroicons-plus" 
        size="sm" 
        color="primary" 
        variant="soft"
        @click="createSession"
      />
    </div>
    
    <div class="flex-1 overflow-y-auto p-2 space-y-1">
      <div class="text-xs font-semibold text-gray-500 uppercase px-2 py-1">Sessions</div>
      <UButton
        v-for="id in savedSessions"
        :key="id"
        :label="id.slice(0, 8) + '...'"
        :variant="id === sessionId ? 'solid' : 'ghost'"
        color="gray"
        class="w-full justify-start"
        @click="switchSession(id)"
      />
    </div>
    
    <div class="p-4 border-t border-gray-200 dark:border-gray-700">
      <div class="text-xs text-gray-500">
        Current Session: <br>
        <span class="font-mono">{{ sessionId }}</span>
      </div>
    </div>
  </div>
</template>
