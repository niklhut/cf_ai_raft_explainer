// stores/cluster.store.ts
import { defineStore } from "pinia"
import type { RaftClusterState } from "@raft-simulator/shared"
import { useSessionStore } from "./chatSessions"

export const useClusterStore = defineStore("cluster", () => {
  const config = useRuntimeConfig()
  const { get } = useApi()

  const sessionStore = useSessionStore()

  // Reactive state
  const clusterState = ref<RaftClusterState | null>(null)
  const isLoading = ref(false)
  const isConnected = ref(false)
  const error = ref<string | null>(null)

  // WebSocket
  let ws: WebSocket | null = null
  let reconnectInterval: any = null

  const fetchState = async () => {
    const sessionId = sessionStore.sessionId
    if (!sessionId) return

    try {
      isLoading.value = true
      const res = (await get(`/state/${sessionId}`)) as RaftClusterState
      clusterState.value = res
    } catch (e) {
      console.error("Failed to fetch state", e)
      error.value = "Failed to fetch state"
    } finally {
      isLoading.value = false
    }
  }

  const connectWebSocket = () => {
    const sessionId = sessionStore.sessionId
    if (!sessionId || !import.meta.client) return

    const protocol = location.protocol === "https:" ? "wss:" : "ws:"
    const host = config.public.apiBase
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "")
    const wsUrl = `${protocol}//${host}/ws/${sessionId}`

    ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      isConnected.value = true
      error.value = null
      if (reconnectInterval) {
        clearInterval(reconnectInterval)
        reconnectInterval = null
      }
    }

    ws.onmessage = (event) => {
      try {
        clusterState.value = JSON.parse(event.data)
      } catch (e) {
        console.error("WS parse error", e)
      }
    }

    ws.onclose = () => {
      isConnected.value = false
      if (!reconnectInterval) {
        reconnectInterval = setInterval(connectWebSocket, 3000)
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

  const initActiveSession = async () => {
    if (sessionStore.sessionId) {
      await fetchState()
      console.log("Loaded messages for session", sessionStore.sessionId, clusterState.value?.chatHistory)
      closeWebSocket()
      connectWebSocket()
    }
  }

  const startPolling = () => {
    if (import.meta.client) connectWebSocket()
  }

  const stopPolling = () => {
    closeWebSocket()
    if (reconnectInterval) {
      clearInterval(reconnectInterval)
      reconnectInterval = null
    }
  }

  return {
    clusterState,
    isLoading,
    isConnected,
    error,
    fetchState,
    connectWebSocket,
    closeWebSocket,
    initActiveSession,
    startPolling,
    stopPolling,
  }
})
