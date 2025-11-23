import type { UIMessage } from "ai"

export interface NodeState {
  id: number
  role: "leader" | "candidate" | "follower" | "dead"
  term: number
}

export interface RaftClusterState {
  id: string
  nodes: NodeState[]
  keyValueStore: Record<string, string>
  lastError: string | null
  chatHistory: UIMessage[]
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
