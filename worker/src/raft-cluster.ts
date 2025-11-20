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

    if (url.pathname === "/websocket") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected Upgrade: websocket", { status: 426 })
      }
      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair)
      this.state.acceptWebSocket(server)
      return new Response(null, { status: 101, webSocket: client })
    }

    if (url.pathname === "/getState") {
      return this.getState()
    }

    if (url.pathname === "/chat") {
      return this.handleChat(request)
    }

    return new Response("Not found", { status: 404 })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    // We can handle messages from client if needed, e.g. ping/pong
    // For now, we just push state updates
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    // Handle close
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    // Handle error
  }

  private broadcastState() {
    const data = JSON.stringify(this.clusterState)
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(data)
      } catch (e) {
        // Handle broken connection
      }
    }
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

      // 1. Update Chat History immediately
      this.clusterState.chatHistory.push({ role: "user", content: prompt })
      this.clusterState.chatHistory.push({
        role: "assistant",
        content: explanation,
      })
      await this.state.storage.put("clusterState", this.clusterState)
      this.broadcastState()

      // 2. Execute Simulation Logic (Async with delays)
      this.state.waitUntil(this.executeCommand(command))

      return new Response(
        JSON.stringify({ success: true }), // State will be pushed via WS
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

  private async executeCommand(command: RaftCommand) {
    switch (command.type) {
      case "FAIL_LEADER":
        await this.failLeader()
        break
      case "FAIL_NODE":
        if (command.nodeId) await this.failNode(command.nodeId)
        break
      case "RECOVER_NODE":
        if (command.nodeId) await this.recoverNode(command.nodeId)
        break
      case "SET_KEY":
        if (command.key)
          await this.setKey(command.key, command.value)
        break
      case "NO_OP":
      default:
        // Do nothing
        break
    }
    // Final persist after async changes
    await this.state.storage.put("clusterState", this.clusterState)
    this.broadcastState()
  }

  private async failLeader() {
    const leader = this.clusterState.nodes.find((n) => n.role === "leader")
    if (leader) {
      leader.alive = false
      this.broadcastState()
      
      // Delay before election
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Trigger election logic
      await this.triggerElection()
    }
  }

  private async failNode(nodeId: number) {
    const node = this.clusterState.nodes.find((n) => n.id === nodeId)
    if (node) {
      node.alive = false
      if (node.role === "leader") {
        this.broadcastState()
        await new Promise(resolve => setTimeout(resolve, 1000))
        await this.triggerElection()
      }
    }
  }

  private async recoverNode(nodeId: number) {
    const node = this.clusterState.nodes.find((n) => n.id === nodeId)
    if (node) {
      node.alive = true
      node.role = "follower" // Recover as follower
    }
  }

  private async setKey(key: string, value: string) {
    // In a real Raft, this would go through the log.
    // Here we just update the state if the leader is alive.
    const leader = this.clusterState.nodes.find((n) => n.role === "leader")
    if (leader && leader.alive) {
      this.clusterState.keyValueStore[key] = value
    }
  }

  private async triggerElection() {
    // Simplified election: Find a new leader among alive nodes
    const aliveNodes = this.clusterState.nodes.filter((n) => n.alive)
    if (aliveNodes.length > 0) {
      this.clusterState.term += 1
      
      // Reset all to followers first (or candidates)
      this.clusterState.nodes.forEach(n => {
        if (n.alive) n.role = "candidate"
      })
      this.broadcastState()
      
      // Election timeout simulation
      await new Promise(resolve => setTimeout(resolve, 1500))

      // Pick a random new leader
      const newLeader = aliveNodes[Math.floor(Math.random() * aliveNodes.length)]
      this.clusterState.nodes.forEach(n => {
        if (n.alive) n.role = "follower"
      })
      newLeader.role = "leader"
    }
  }
}
