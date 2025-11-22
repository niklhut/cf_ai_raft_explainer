import type { RaftClusterState, ChatMessage } from "@raft-simulator/shared"
import type { SavedSession } from "~/utils/types"
import { Chat } from "@ai-sdk/vue"
import { TextStreamChatTransport, type UIMessage } from "ai"

export const useRaftSession = () => {
  const config = useRuntimeConfig()
  const sessionId = useState<string | null>("sessionId", () => null)
  const savedSessions = useState<SavedSession[]>("savedSessions", () => [])
  const clusterState = useState<RaftClusterState | null>(
    "clusterState",
    () => null,
  )
  const isLoading = useState<boolean>("isLoading", () => false)
  const isConnected = useState<boolean>("isConnected", () => false)
  const error = useState<string | null>("error", () => null)

  const { get, post } = useApi()

  const transport = new TextStreamChatTransport({
    fetch: async (input, init) => {
      if (!sessionId.value) throw new Error("No session")
      const url = `${config.public.apiBase}/chat/${sessionId.value}`

      const response = await fetch(url, init)

      if (!response.ok) throw new Error("Failed to send message")

      // Handle State Update from Header
      const stateHeader = response.headers.get("X-Raft-State")
      if (stateHeader && clusterState.value) {
        const newState = JSON.parse(stateHeader)
        clusterState.value.nodes = newState.nodes
        clusterState.value.keyValueStore = newState.keyValueStore
        clusterState.value.lastError = newState.lastError
      }

      return response
    },
  })

  // Initialize Chat with empty messages, we'll sync from clusterState
  const chat = new Chat({
    messages: [],
    transport,
  })

  // Sync chat messages with clusterState
  watch(
    [() => clusterState.value?.chatHistory, () => chat.status],
    ([newHistory, status]) => {
      if (newHistory && (status === "ready" || status === "error")) {
        // Convert ChatMessage to UIMessage
        const newMessages = newHistory.map((m, i) => ({
          id: `history-${i}`,
          role: m.role,
          content: m.content,
          parts: [{ type: "text", text: m.content }],
        })) as unknown as UIMessage[]

        // Simple check to avoid unnecessary updates if length is same and last message content is same
        const currentMessages = chat.messages

        // Avoid reverting local state if we have more messages (e.g. just finished streaming but WS hasn't caught up)
        if (currentMessages.length > newMessages.length) {
          return
        }

        if (currentMessages.length === newMessages.length) {
          const lastCurrent = currentMessages[currentMessages.length - 1] as any
          const lastNew = newMessages[newMessages.length - 1] as any
          if (lastCurrent?.content === lastNew?.content) {
            return
          }
        }

        chat.messages = newMessages
      }
    },
    { immediate: true },
  )

  const fetchState = async () => {
    if (!sessionId.value) return
    try {
      const res = (await get(`/state/${sessionId.value}`)) as RaftClusterState
      clusterState.value = res
    } catch (e) {
      console.error("Failed to fetch state", e)
    }
  }

  const createSession = async () => {
    try {
      isLoading.value = true
      const res = (await post("/chat/new", {})) as { sessionId: string }
      sessionId.value = res.sessionId

      if (import.meta.client) {
        localStorage.setItem("raft_session_id", res.sessionId)

        if (
          !savedSessions.value.find((session) => session.id === res.sessionId)
        ) {
          savedSessions.value.push({
            id: res.sessionId,
            title: `Raft Simulation ${savedSessions.value.length + 1}`,
          })
          localStorage.setItem(
            "raft_sessions",
            JSON.stringify(savedSessions.value),
          )
        }
      }

      await fetchState()
      closeWebSocket()
      connectWebSocket()
    } catch (e) {
      error.value = "Failed to create session"
      console.error(e)
    } finally {
      isLoading.value = false
    }
  }

  const initSession = async () => {
    if (import.meta.client) {
      const sessions = localStorage.getItem("raft_sessions")
      if (sessions) {
        savedSessions.value = JSON.parse(sessions)
      }

      const stored = localStorage.getItem("raft_session_id")
      if (stored) {
        sessionId.value = stored
        await fetchState()
      } else if (savedSessions.value.length > 0) {
        sessionId.value = savedSessions.value[0]!.id
        localStorage.setItem("raft_session_id", sessionId.value)
        await fetchState()
      } else {
        await createSession()
      }
    }
  }

  const switchSession = async (id: string) => {
    sessionId.value = id
    if (import.meta.client) {
      localStorage.setItem("raft_session_id", id)
    }
    chat.messages = [] // Clear chat history
    await fetchState()
    closeWebSocket()
    connectWebSocket()
  }

  const sendMessage = async (prompt: string) => {
    if (!sessionId.value) return
    try {
      await chat.sendMessage({ text: prompt })
    } catch (e) {
      error.value = "Failed to send message"
      console.error(e)
    }
  }

  let ws: WebSocket | null = null
  let reconnectInterval: any

  const connectWebSocket = () => {
    if (!sessionId.value || !import.meta.client) return

    const protocol = location.protocol === "https:" ? "wss:" : "ws:"
    const host = config.public.apiBase
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "")
    const wsUrl = `${protocol}//${host}/ws/${sessionId.value}`

    ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      console.log("WS Connected")
      error.value = null
      isConnected.value = true
      if (reconnectInterval) {
        clearInterval(reconnectInterval)
        reconnectInterval = null
      }
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as RaftClusterState
        clusterState.value = data
      } catch (e) {
        console.error("Failed to parse WS message", e)
      }
    }

    ws.onclose = () => {
      console.log("WS Closed")
      isConnected.value = false
      // Reconnect logic
      if (!reconnectInterval) {
        reconnectInterval = setInterval(() => {
          console.log("Attempting reconnect...")
          connectWebSocket()
        }, 3000)
      }
    }

    ws.onerror = (e) => {
      console.error("WS Error", e)
    }
  }

  const closeWebSocket = () => {
    if (ws) {
      ws.close(1000, "Closing previous connection")
      ws = null
    }
  }

  const startPolling = () => {
    if (import.meta.client) {
      fetchState() // Initial fetch
      connectWebSocket()
    }
  }

  const stopPolling = () => {
    if (ws) {
      ws.close()
      ws = null
    }
    if (reconnectInterval) {
      clearInterval(reconnectInterval)
      reconnectInterval = null
    }
  }

  return {
    sessionId,
    savedSessions,
    clusterState,
    isLoading,
    isConnected,
    error,
    chat,
    initSession,
    createSession,
    switchSession,
    sendMessage,
    startPolling,
    stopPolling,
  }
}
