import type { Env } from "./types"
import type {
  NodeState,
  RaftClusterState,
  ChatMessage,
  RaftCommand,
} from "@raft-simulator/shared"

export class RaftCluster {
  private state: DurableObjectState
  private clusterState: RaftClusterState

  constructor(state: DurableObjectState, private env: Env) {
    this.state = state
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<RaftClusterState>(
        "clusterState",
      )
      this.clusterState = stored || {
        nodes: [
          { id: 1, role: "leader", term: 1, alive: true },
          { id: 2, role: "follower", term: 1, alive: true },
          { id: 3, role: "follower", term: 1, alive: true },
          { id: 4, role: "follower", term: 1, alive: true },
          { id: 5, role: "follower", term: 1, alive: true },
        ],
        term: 1,
        keyValueStore: {},
        chatHistory: [],
      }
    })
  }

  async fetch(request: Request) {
    const url = new URL(request.url)

    if (url.pathname === "/getState") {
      return this.getState()
    }

    if (url.pathname === "/chat") {
      return this.handleChat(request)
    }

    return new Response("Not found", { status: 404 })
  }

  async getState() {
    return new Response(JSON.stringify(this.clusterState), {
      headers: { "Content-Type": "application/json" },
    })
  }

  async handleChat(request: Request) {
    try {
      const { prompt, command, explanation } = (await request.json()) as {
        prompt: string
        command: RaftCommand
        explanation: string
      }

      // 1. Execute Simulation Logic
      this.executeCommand(command)

      // 2. Update Chat History
      this.clusterState.chatHistory.push({ role: "user", content: prompt })
      this.clusterState.chatHistory.push({
        role: "assistant",
        content: explanation,
      })

      // 3. Persist State
      await this.state.storage.put("clusterState", this.clusterState)

      return new Response(
        JSON.stringify({ success: true, state: this.clusterState }),
        {
          headers: { "Content-Type": "application/json" },
        },
      )
    } catch (error) {
      return new Response(JSON.stringify({ error: (error as Error).message }), {
        status: 500,
      })
    }
  }

  private executeCommand(command: RaftCommand) {
    switch (command.type) {
      case "FAIL_LEADER":
        this.failLeader()
        break
      case "FAIL_NODE":
        if (command.nodeId) this.failNode(command.nodeId)
        break
      case "RECOVER_NODE":
        if (command.nodeId) this.recoverNode(command.nodeId)
        break
      case "SET_KEY":
        if (command.key && command.value)
          this.setKey(command.key, command.value)
        break
      case "NO_OP":
      default:
        // Do nothing
        break
    }
  }

  private failLeader() {
    const leader = this.clusterState.nodes.find((n) => n.role === "leader")
    if (leader) {
      leader.alive = false
      // Trigger election logic (simplified for simulation)
      this.triggerElection()
    }
  }

  private failNode(nodeId: number) {
    const node = this.clusterState.nodes.find((n) => n.id === nodeId)
    if (node) {
      node.alive = false
      if (node.role === "leader") {
        this.triggerElection()
      }
    }
  }

  private recoverNode(nodeId: number) {
    const node = this.clusterState.nodes.find((n) => n.id === nodeId)
    if (node) {
      node.alive = true
      node.role = "follower" // Recover as follower
    }
  }

  private setKey(key: string, value: string) {
    // In a real Raft, this would go through the log.
    // Here we just update the state if the leader is alive.
    const leader = this.clusterState.nodes.find((n) => n.role === "leader")
    if (leader && leader.alive) {
      this.clusterState.keyValueStore[key] = value
    }
  }

  private triggerElection() {
    // Simplified election: Find a new leader among alive nodes
    const aliveNodes = this.clusterState.nodes.filter((n) => n.alive)
    if (aliveNodes.length > 0) {
      this.clusterState.term += 1
      // Reset all to followers first
      this.clusterState.nodes.forEach((n) => {
        if (n.alive) n.role = "follower"
      })
      // Pick a random new leader
      const newLeader =
        aliveNodes[Math.floor(Math.random() * aliveNodes.length)]
      newLeader.role = "leader"
    }
  }
}
