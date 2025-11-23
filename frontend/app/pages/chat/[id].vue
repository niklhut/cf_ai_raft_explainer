<script setup lang="ts">
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { storeToRefs } from 'pinia'

const route = useRoute()

const sessionStore = useSessionStore()
const { switchSession } = sessionStore

const clusterStore = useClusterStore()
const { initActiveSession, stopPolling } = clusterStore
const { clusterState, isLoading, isConnected, error } = storeToRefs(clusterStore)

const isChatSlideoverOpen = ref(false)

onMounted(async () => {
    const id = route.params.id as string
    if (id) {
        await switchSession(id)
        initActiveSession()
    }
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

        <ChatInterface v-if="clusterState && !isMobile" :sessionId="clusterState.id" :initialMessages="clusterState.chatHistory" :key="clusterState.id" />

        <ClientOnly>
            <USlideover v-if="isMobile" v-model:open="isChatSlideoverOpen" side="bottom">
                <template #header>
                    <h3 class="text-lg font-semibold w-full">Interactive Assistant</h3>
                    <UIcon name="i-heroicons-x-mark" class="w-6 h-6 cursor-pointer"
                        @click="isChatSlideoverOpen = false" />
                </template>
                <template #body>
                    <ChatInterface v-if="clusterState" :sessionId="clusterState.id" :initialMessages="clusterState.chatHistory" :key="clusterState.id"
                        @close="isChatSlideoverOpen = false" />
                </template>
            </USlideover>
        </ClientOnly>
    </UDashboardGroup>
</template>
