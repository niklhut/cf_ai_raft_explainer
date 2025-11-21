<script setup lang="ts">
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'

const { initSession, startPolling, stopPolling, clusterState, isLoading, isConnected, error, sendMessage, streamingMessage, optimisticUserMessage } = useRaftSession()

const isChatSlideoverOpen = ref(false)

onMounted(async () => {
    await initSession()
    startPolling()
})

onUnmounted(() => {
    stopPolling()
})

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('lg')
</script>

<template>
    <UDashboardGroup>
        <Sidebar />

        <UDashboardPanel id="main-panel" :default-size="50" :min-size="40" :max-size="60" resizable>
            <template #header>
                <UDashboardNavbar title="Raft Simulation">
                    <template #leading>
                        <UDashboardSidebarCollapse />
                    </template>
                    <template #right>
                        <UBadge v-if="isLoading" color="warning" variant="subtle">Syncing...</UBadge>
                        <UBadge v-else-if="!isConnected" color="warning" variant="subtle">Connecting...</UBadge>
                        <UBadge v-else color="success" variant="subtle">Connected</UBadge>
                    </template>
                </UDashboardNavbar>
            </template>


            <template #body>
                <div v-if="clusterState">
                    <h2 class="text-xl font-bold mb-4">Cluster Visualization (Term: {{clusterState.nodes.find(n =>
                        n.role === 'leader')?.term}})</h2>
                    <NodeVisualization :nodes="clusterState.nodes" />

                    <div class="mt-8">
                        <StateTable :data="clusterState.keyValueStore" />
                    </div>
                </div>
                <div v-else class="flex items-center justify-center h-64">
                    <UIcon name="i-heroicons-arrow-path" class="animate-spin w-8 h-8 text-gray-400" />
                </div>

                <ClientOnly>
                    <template v-if="isMobile">
                        <UButton color="primary" @click="isChatSlideoverOpen = true">Open Chat Assistant</UButton>
                    </template>
                </ClientOnly>
            </template>

        </UDashboardPanel>

        <ChatInterface v-if="clusterState && !isMobile" :history="clusterState.chatHistory" :loading="isLoading"
            :streaming-message="streamingMessage" :optimistic-user-message="optimisticUserMessage"
            @send="sendMessage" />

        <ClientOnly>
            <USlideover v-if="isMobile" v-model:open="isChatSlideoverOpen" side="bottom">
                <template #header>
                    <h3 class="text-lg font-semibold w-full">Interactive Assistant</h3>
                    <UIcon name="i-heroicons-x-mark" class="w-6 h-6 cursor-pointer" @click="isChatSlideoverOpen = false" />
                </template>
                <template #body>
                    <ChatInterface v-if="clusterState" :history="clusterState.chatHistory" :loading="isLoading"
                        :streaming-message="streamingMessage" :optimistic-user-message="optimisticUserMessage"
                        @send="sendMessage" @close="isChatSlideoverOpen = false" />
                </template>
            </USlideover>
        </ClientOnly>
    </UDashboardGroup>
</template>