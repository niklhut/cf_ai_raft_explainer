import type { RaftClusterState, ChatMessage } from "@raft-simulator/shared"
import type { SavedSession } from "~/utils/types"

export const useRaftSession = () => {
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

        if (!savedSessions.value.find(session => session.id === res.sessionId)) {
          savedSessions.value.push({ id: res.sessionId, title: `Raft Simulation ${savedSessions.value.length + 1}` })
          localStorage.setItem(
            "raft_sessions",
            JSON.stringify(savedSessions.value),
          )
        }
      }

      await fetchState()
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
  }

  const sendMessage = async (prompt: string) => {
    if (!sessionId.value) return
    try {
      isLoading.value = true
      // We still use POST for sending commands, but state updates come via WS
      const res = (await post(`/chat/${sessionId.value}`, { prompt })) as {
        success: boolean
      }
      // No need to update clusterState here, WS will do it
    } catch (e) {
      error.value = "Failed to send message"
      console.error(e)
    } finally {
      isLoading.value = false
    }
  }

  let ws: WebSocket | null = null
  let reconnectInterval: any

  const connectWebSocket = () => {
    if (!sessionId.value || !import.meta.client) return

    const protocol = location.protocol === "https:" ? "wss:" : "ws:"
    const host = "localhost:8787" // In prod this should be dynamic
    const wsUrl = `${protocol}//${host}/api/ws/${sessionId.value}`

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
    initSession,
    createSession,
    switchSession,
    sendMessage,
    startPolling,
    stopPolling,
  }
}
