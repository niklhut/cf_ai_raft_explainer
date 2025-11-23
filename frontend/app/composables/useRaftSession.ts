// import { useRaftStore } from "~/stores/raft"
// import { storeToRefs } from "pinia"

// export const useRaftSession = () => {
//   const store = useRaftStore()
//   const { sessionId, savedSessions, clusterState, isLoading, isConnected, error, chat } = storeToRefs(store)
//   const { initSession, createSession, switchSession, sendMessage, startPolling, stopPolling } = store

//   return {
//     sessionId,
//     savedSessions,
//     clusterState,
//     isLoading,
//     isConnected,
//     error,
//     chat,
//     initSession,
//     createSession,
//     switchSession,
//     sendMessage,
//     startPolling,
//     stopPolling,
//   }
// }
