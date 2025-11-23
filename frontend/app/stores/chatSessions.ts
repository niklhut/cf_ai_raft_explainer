import { defineStore } from "pinia"
import type { SavedSession } from "~/utils/types"

export const useSessionStore = defineStore(
  "session",
  () => {
    const { post } = useApi()

    const sessionId = ref<string | null>(null)
    const savedSessions = ref<SavedSession[]>([])
    const error = ref<string | null>(null)

    const createSession = async () => {
      try {
        const res = (await post("/chat/new", {})) as { sessionId: string }
        sessionId.value = res.sessionId

        // Only push if not existing
        if (!savedSessions.value.find((s) => s.id === res.sessionId)) {
          savedSessions.value.push({
            id: res.sessionId,
            title: `Raft Simulation ${savedSessions.value.length + 1}`,
          })
        }
        return res.sessionId
      } catch (e) {
        error.value = "Failed to create session"
        console.error(e)
      }
    }

    const switchSession = async (id: string) => {
      sessionId.value = id
    }

    return {
      sessionId,
      savedSessions,
      error,
      createSession,
      switchSession,
    }
  },
  {
    persist: {
      pick: ["sessionId", "savedSessions"],
    },
  },
)
