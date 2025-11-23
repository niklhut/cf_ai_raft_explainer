// import { defineStore } from "pinia"
// import type { RaftClusterState } from "@raft-simulator/shared"
// import type { SavedSession } from "~/utils/types"

// export const useRaftStore = defineStore(
//   "raft",
//   () => {
//     const config = useRuntimeConfig()
//     const { get, post } = useApi()

//     // State
//     const sessionId = ref<string | null>(null)
//     const savedSessions = ref<SavedSession[]>([])
//     const clusterState = ref<RaftClusterState | null>(null)
//     const isLoading = ref(false)
//     const isConnected = ref(false)
//     const error = ref<string | null>(null)

//     // WebSocket
//     let ws: WebSocket | null = null
//     let reconnectInterval: any = null

//     const fetchState = async () => {
//       if (!sessionId.value) return
//       try {
//         const res = (await get(`/state/${sessionId.value}`)) as RaftClusterState
//         console.log("Fetched state:", res)
//         clusterState.value = res
//       } catch (e) {
//         console.error("Failed to fetch state", e)
//       }
//     }

//     const connectWebSocket = () => {
//       if (!sessionId.value || !import.meta.client) return

//       const protocol = location.protocol === "https:" ? "wss:" : "ws:"
//       const host = config.public.apiBase
//         .replace(/^https?:\/\//, "")
//         .replace(/\/$/, "")
//       const wsUrl = `${protocol}//${host}/ws/${sessionId.value}`

//       ws = new WebSocket(wsUrl)

//       ws.onopen = () => {
//         console.log("WS Connected")
//         error.value = null
//         isConnected.value = true
//         if (reconnectInterval) {
//           clearInterval(reconnectInterval)
//           reconnectInterval = null
//         }
//       }

//       ws.onmessage = (event) => {
//         try {
//           const data = JSON.parse(event.data) as RaftClusterState
//           clusterState.value = data
//         } catch (e) {
//           console.error("Failed to parse WS message", e)
//         }
//       }

//       ws.onclose = () => {
//         console.log("WS Closed")
//         isConnected.value = false
//         // Reconnect logic
//         if (!reconnectInterval) {
//           reconnectInterval = setInterval(() => {
//             console.log("Attempting reconnect...")
//             connectWebSocket()
//           }, 3000)
//         }
//       }

//       ws.onerror = (e) => {
//         console.error("WS Error", e)
//       }
//     }

//     const closeWebSocket = () => {
//       if (ws) {
//         ws.close(1000, "Closing previous connection")
//         ws = null
//       }
//     }

//     const createSession = async () => {
//       try {
//         isLoading.value = true
//         const res = (await post("/chat/new", {})) as { sessionId: string }
//         sessionId.value = res.sessionId

//         if (
//           !savedSessions.value.find((session) => session.id === res.sessionId)
//         ) {
//           savedSessions.value.push({
//             id: res.sessionId,
//             title: `Raft Simulation ${savedSessions.value.length + 1}`,
//           })
//         }

//         await fetchState()
//         closeWebSocket()
//         connectWebSocket()
//       } catch (e) {
//         error.value = "Failed to create session"
//         console.error(e)
//       } finally {
//         isLoading.value = false
//       }
//     }

//     const initSession = async () => {
//       if (import.meta.client) {
//         if (sessionId.value) {
//           console.log("Initializing existing session", sessionId.value)
//           await fetchState()
//           console.log("Cluster State:", clusterState.value)
//         }
//       }
//     }

//     const switchSession = async (id: string) => {
//       sessionId.value = id
//       await fetchState()
//       closeWebSocket()
//       connectWebSocket()
//     }

//     const startPolling = () => {
//       if (import.meta.client) {
//         connectWebSocket()
//       }
//     }

//     const stopPolling = () => {
//       if (ws) {
//         closeWebSocket()
//       }
//       if (reconnectInterval) {
//         clearInterval(reconnectInterval)
//         reconnectInterval = null
//       }
//     }

//     return {
//       sessionId,
//       savedSessions,
//       clusterState,
//       isLoading,
//       isConnected,
//       error,
//       initSession,
//       createSession,
//       switchSession,
//       startPolling,
//       stopPolling,
//     }
//   },
//   {
//     persist: {
//       pick: ["sessionId", "savedSessions"],
//     },
//   },
// )
