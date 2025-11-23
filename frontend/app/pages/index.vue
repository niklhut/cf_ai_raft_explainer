<script setup lang="ts">
const sessionStore = useSessionStore()
const { createSession } = sessionStore
const { savedSessions, sessionId } = storeToRefs(sessionStore)
const router = useRouter()

onMounted(async () => {
    if (savedSessions.value.length > 0) {
        const lastSession = savedSessions.value[savedSessions.value.length - 1]
        if (lastSession) {
            router.push(`/chat/${lastSession.id}`)
        }
    } else {
        const newSessionId = await createSession()
        if (newSessionId) {
            router.push(`/chat/${newSessionId}`)
        }
    }
})
</script>

<template>
    <div class="flex items-center justify-center h-screen">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin w-8 h-8 text-gray-400" />
    </div>
</template>
