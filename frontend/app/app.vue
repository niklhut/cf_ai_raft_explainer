<script setup lang="ts">
const { initSession, startPolling, stopPolling, clusterState, isLoading, error, sendMessage } = useRaftSession()

onMounted(async () => {
  await initSession()
  startPolling()
})

onUnmounted(() => {
  stopPolling()
})
</script>

<template>
  <div class="flex h-screen w-screen overflow-hidden bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
    <Sidebar />
    
    <main class="flex-1 flex flex-col h-full overflow-hidden">
      <!-- Header -->
      <header class="h-14 border-b border-gray-200 dark:border-gray-800 flex items-center px-4 bg-white dark:bg-gray-900">
        <h1 class="text-lg font-semibold">Raft Consensus Simulator</h1>
        <div class="ml-auto flex items-center space-x-2">
          <UBadge v-if="isLoading" color="warning" variant="subtle">Syncing...</UBadge>
          <UBadge v-else color="success" variant="subtle">Connected</UBadge>
        </div>
      </header>

      <!-- Content -->
      <div class="flex-1 flex overflow-hidden">
        <!-- Left Panel: Visualization & State -->
        <div class="w-2/3 p-4 overflow-y-auto space-y-6 bg-gray-50 dark:bg-gray-900/50">
          <div v-if="error" class="p-4 bg-red-100 text-red-700 rounded-lg">
            {{ error }}
          </div>

          <div v-if="clusterState">
            <h2 class="text-xl font-bold mb-4">Cluster Visualization (Term: {{ clusterState.term }})</h2>
            <NodeVisualization :nodes="clusterState.nodes" />
            
            <div class="mt-8">
              <StateTable :data="clusterState.keyValueStore" />
            </div>
          </div>
          <div v-else class="flex items-center justify-center h-64">
            <UIcon name="i-heroicons-arrow-path" class="animate-spin w-8 h-8 text-gray-400" />
          </div>
        </div>

        <!-- Right Panel: Chat -->
        <div class="w-1/3 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col">
          <div class="p-3 border-b border-gray-200 dark:border-gray-800 font-semibold">
            Interactive Assistant
          </div>
          <ChatInterface 
            v-if="clusterState"
            :history="clusterState.chatHistory" 
            :loading="isLoading"
            @send="sendMessage"
          />
        </div>
      </div>
    </main>
  </div>
</template>
