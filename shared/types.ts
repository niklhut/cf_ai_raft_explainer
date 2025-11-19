export interface NodeState {
  id: number
  role: "leader" | "candidate" | "follower"
  term: number
  alive: boolean
}
