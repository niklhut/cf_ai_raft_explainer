export interface NodeState {
  id: number
  role: "leader" | "candidate" | "follower"
  term: number
  alive: boolean
}

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

export interface RaftClusterState {
  nodes: NodeState[]
  term: number
  keyValueStore: Record<string, string>
  chatHistory: ChatMessage[]
}

export type RaftCommandType =
  | "FAIL_LEADER"
  | "FAIL_NODE"
  | "RECOVER_NODE"
  | "SET_KEY"
  | "NO_OP"

export interface RaftCommand {
  type: RaftCommandType
  nodeId?: number
  key?: string
  value?: string
  explanation?: string
}
