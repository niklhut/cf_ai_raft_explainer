import type { RaftClusterState, ChatMessage } from "@raft-simulator/shared"
import type { SavedSession } from "~/utils/types"

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
  const streamingMessage = useState<string | null>(
    "streamingMessage",
    () => null,
  )
  const optimisticUserMessage = useState<string | null>(
    "optimisticUserMessage",
    () => null,
  )

  const { get, post } = useApi()

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
    await fetchState()
    closeWebSocket()
    connectWebSocket()
  }

  const sendMessage = async (prompt: string) => {
    if (!sessionId.value) return
    try {
      isLoading.value = true
      streamingMessage.value = ""
      optimisticUserMessage.value = prompt

      const config = useRuntimeConfig()
      const response = await fetch(
        `${config.public.apiBase}/chat/${sessionId.value}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ prompt }),
        },
      )

      if (!response.ok) throw new Error("Failed to send message")

      // Handle State Update from Header
      const stateHeader = response.headers.get("X-Raft-State")
      if (stateHeader && clusterState.value) {
        const newState = JSON.parse(stateHeader)
        clusterState.value.nodes = newState.nodes
        clusterState.value.keyValueStore = newState.keyValueStore
        clusterState.value.lastError = newState.lastError
      }

      // Handle Streaming Response
      const reader = response.body?.getReader()
      if (!reader) return

      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        streamingMessage.value += decoder.decode(value, { stream: true })
      }

      // We do NOT manually update history here to avoid duplication with WS update.
      // The WS update from the server (triggered by addHistory) will arrive shortly.
      // We keep optimisticUserMessage and streamingMessage populated until then?
      // No, if we clear them now, there might be a flicker.
      // But if we don't clear them, we might see duplicates when WS arrives.

      // Strategy: Clear them only when we see the new messages in the clusterState via WS.
      // For now, let's clear them and rely on the speed of WS.
      // If flicker is an issue, we can improve later.
      // Actually, the user complained about duplication, so removing the manual push is the priority.
    } catch (e) {
      error.value = "Failed to send message"
      console.error(e)
    } finally {
      isLoading.value = false
      // Do NOT clear optimistic messages here.
      // They will be cleared when the WS update arrives to prevent flicker.
    }
  }

  let ws: WebSocket | null = null
  let reconnectInterval: any

  const connectWebSocket = () => {
    if (!sessionId.value || !import.meta.client) return

    const protocol = location.protocol === "https:" ? "wss:" : "ws:"
    const host = config.public.apiBase.replace(/^https?:\/\//, "").replace(/\/$/, "")
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

        // If we have optimistic messages, and the new data has more history than before,
        // it means our message has been committed. Clear optimistic state to avoid duplicates.
        if (
          optimisticUserMessage.value &&
          data.chatHistory.length >
            (clusterState.value?.chatHistory.length || 0)
        ) {
          optimisticUserMessage.value = null
          streamingMessage.value = null
        }

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
      ws.close()
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
    streamingMessage,
    optimisticUserMessage,
    initSession,
    createSession,
    switchSession,
    sendMessage,
    startPolling,
    stopPolling,
  }
}
