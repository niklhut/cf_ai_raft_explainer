<script setup lang="ts">
const { savedSessions, sessionId, createSession, switchSession } = useRaftSession()

const items = computed(() => [
  [
    {
      label: 'Create New Session',
      icon: 'i-heroicons-plus',
      to: '#',
      variant: 'soft' as const,
      color: 'primary' as const,
      onSelect: () => createSession()
    },
    ...savedSessions.value.toReversed().map(session => ({
      label: session.title ?? "",
      icon: 'i-heroicons-document-text',
      to: '#',
      active: session.id === sessionId.value,
      color: 'neutral' as const,
      onSelect: () => {
        console.log(`Switching to session ${session.id}`)
        switchSession(session.id)
      }
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
