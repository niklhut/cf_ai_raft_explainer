<script setup lang="ts">
const raftStore = useRaftStore()
const { createSession } = raftStore
const { savedSessions } = storeToRefs(raftStore)
const router = useRouter()

onMounted(async () => {
    if (savedSessions.value.length > 0) {
        const lastSession = savedSessions.value[savedSessions.value.length - 1]
        if (lastSession) {
            router.push(`/chat/${lastSession.id}`)
        }
    } else {
        await createSession()
        if (raftStore.sessionId) {
            router.push(`/chat/${raftStore.sessionId}`)
        }
    }
})
</script>

<template>
    <div class="flex items-center justify-center h-screen">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin w-8 h-8 text-gray-400" />
    </div>
</template>
