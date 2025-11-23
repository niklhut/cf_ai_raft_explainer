<script setup lang="ts">

const sessionStore = useSessionStore()
const { createSession } = sessionStore
const { savedSessions, sessionId } = storeToRefs(sessionStore)
const router = useRouter()

const handleCreateSession = async () => {
  await createSession()
  if (sessionId.value) {
    router.push(`/chat/${sessionId.value}`)
  }
}

const items = computed(() => [
  [
    {
      label: 'Create New Session',
      icon: 'i-heroicons-plus',
      to: '#',
      variant: 'soft' as const,
      color: 'primary' as const,
      onSelect: handleCreateSession
    },
    ...savedSessions.value.toReversed().map(session => ({
      label: session.title ?? "",
      icon: 'i-heroicons-document-text',
      to: `/chat/${session.id}`,
      active: session.id === sessionId.value,
      color: 'neutral' as const,
    })),
  ]
])
</script>

<template>
  <UDashboardSidebar collapsible resizable>
    <template #header="{ collapsed }">
      <h2 v-if="!collapsed" class="font-bold w-auto text-xl">Raft Simulator</h2>
      <h2 v-else class="font-bold text-xl mx-auto">RS</h2>
    </template>

    <template #default="{ collapsed }">

      <UNavigationMenu :collapsed="collapsed" :items="items[0]" orientation="vertical" />

      <UNavigationMenu :collapsed="collapsed" :items="items[1]" orientation="vertical" class="mt-auto" />
    </template>
  </UDashboardSidebar>
</template>
