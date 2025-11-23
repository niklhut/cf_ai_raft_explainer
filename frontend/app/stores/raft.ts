import { defineStore, skipHydrate } from "pinia"
import type { RaftClusterState, ChatMessage } from "@raft-simulator/shared"
import type { SavedSession } from "~/utils/types"
import { Chat } from "@ai-sdk/vue"
import { TextStreamChatTransport, type UIMessage } from "ai"

export const useRaftStore = defineStore(
  "raft",
  () => {
    const config = useRuntimeConfig()
    const { get, post } = useApi()

    // State
    const sessionId = ref<string | null>(null)
    const savedSessions = ref<SavedSession[]>([])
    const clusterState = ref<RaftClusterState | null>(null)
    const isLoading = ref(false)
    const isConnected = ref(false)
    const error = ref<string | null>(null)

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
      body: {
        id: "adsf"
      }
    })

    // Chat instance
    const chat = ref<Chat<UIMessage>>(
      new Chat({ messages: [] as UIMessage[], transport }),
    )

    // WebSocket
    let ws: WebSocket | null = null
    let reconnectInterval: any = null

    // Actions
    const initChat = () => {
      if (!sessionId.value) return

      // Create new chat instance with correct transport
      const newChat = new Chat({
        messages: [],
        transport,
      })

      console.log("Error:", newChat.error)
      chat.value = newChat
      // console.log("Chat initialized:", chat.value.error)
    }

    const syncChatWithState = () => {
      const newHistory = clusterState.value?.chatHistory
      const status = chat.value.status

      console.log("Syncing chat. Status:", status, "New history:", newHistory)
      chat.value.messages = newHistory as UIMessage[]

      // if (newHistory && (status === "ready" || status === "error")) {
      //   // Convert ChatMessage to UIMessage
      //   const newMessages = newHistory.map((m, i) => ({
      //     id: `history-${i}`,
      //     role: m.role,
      //     content: m.content,
      //     parts: [{ type: "text", text: m.content }],
      //   })) as UIMessage[]

      //   const currentMessages = chat.value.messages

      //   // Avoid reverting local state if we have more messages (e.g. just finished streaming but WS hasn't caught up)
      //   if (currentMessages.length > newMessages.length) {
      //     return
      //   }

      //   if (currentMessages.length === newMessages.length) {
      //     const lastCurrent = currentMessages[currentMessages.length - 1] as any
      //     const lastNew = newMessages[newMessages.length - 1] as any
      //     if (lastCurrent?.content === lastNew?.content) {
      //       return
      //     }
      //   }

      //   chat.value.messages = newMessages
      // }
    }

    // Watch for state changes to sync chat
    watch(() => clusterState.value?.chatHistory, syncChatWithState)
    watch(() => chat.value.status, syncChatWithState)

    const fetchState = async () => {
      if (!sessionId.value) return
      try {
        const res = (await get(`/state/${sessionId.value}`)) as RaftClusterState
        console.log("Fetched state:", res)
        clusterState.value = res
      } catch (e) {
        console.error("Failed to fetch state", e)
      }
    }

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

    const createSession = async () => {
      try {
        isLoading.value = true
        const res = (await post("/chat/new", {})) as { sessionId: string }
        sessionId.value = res.sessionId

        if (
          !savedSessions.value.find((session) => session.id === res.sessionId)
        ) {
          savedSessions.value.push({
            id: res.sessionId,
            title: `Raft Simulation ${savedSessions.value.length + 1}`,
          })
        }

        initChat()
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
        if (sessionId.value) {
          console.log("Initializing existing session", sessionId.value)
          initChat()
          await fetchState()
          console.log("Cluster State:", clusterState.value)
        } else if (savedSessions.value.length > 0) {
          sessionId.value =
            savedSessions.value[savedSessions.value.length - 1]!.id
          initChat()
          await fetchState()
        } else {
          await createSession()
        }
      }
    }

    const switchSession = async (id: string) => {
      sessionId.value = id
      initChat()
      await fetchState()
      closeWebSocket()
      connectWebSocket()
    }

    const startPolling = () => {
      if (import.meta.client) {
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

    const sendMessage = async (prompt: string) => {
      if (!sessionId.value) return
      try {
        await chat.value.sendMessage({ text: prompt })
      } catch (e) {
        error.value = "Failed to send message"
        console.error(e)
      }
    }

    return {
      sessionId,
      savedSessions,
      clusterState,
      isLoading,
      isConnected,
      error,
      chat: skipHydrate(chat as Ref<Chat<UIMessage>>),
      initSession,
      createSession,
      switchSession,
      sendMessage,
      startPolling,
      stopPolling,
    }
  },
  {
    persist: {
      pick: ["sessionId", "savedSessions"],
    },
  },
)
