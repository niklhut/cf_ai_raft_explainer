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
      const leaderId = Math.floor(Math.random() * 5) + 1
      const nodes: NodeState[] = []
      for (let i = 1; i <= 5; i++) {
        nodes.push({
          id: i,
          role: i === leaderId ? "leader" : "follower",
          term: 1,
        })
      }
      this.clusterState = stored || {
        nodes: nodes,
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
    if (typeof message === "string" && message === "ping") {
      ws.send("pong")
      return
    }
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
  ) {
    console.log("WebSocket closed", { code, reason, wasClean })
    ws.close(code, "Client closed connection")
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    console.error("WebSocket error", error)
    ws.close(1011, "Internal error")
  }

  private broadcastState() {
    const data = JSON.stringify(this.clusterState)
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(data)
      } catch (e) {
        console.error("Error sending WebSocket message", e)
        ws.close(1011, "Internal error")
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
        if (command.key) await this.setKey(command.key, command.value)
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
      leader.role = "dead"
      console.log(this.clusterState)
      this.broadcastState()

      // Delay before election
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Trigger election logic
      await this.triggerElection()
    }
  }

  private async failNode(nodeId: number) {
    const node = this.clusterState.nodes.find((n) => n.id === nodeId)
    if (node) {
      const wasLeader = node.role === "leader"
      node.role = "dead"
      if (wasLeader) {
        this.broadcastState()
        await new Promise((resolve) => setTimeout(resolve, 1000))
        await this.triggerElection()
      }
    }
  }

  private async recoverNode(nodeId: number) {
    const leader = this.clusterState.nodes.find((n) => n.role === "leader")
    const node = this.clusterState.nodes.find((n) => n.id === nodeId)
    if (node) {
      node.role = "follower"
      this.broadcastState()

      // Delay before checking for election
      await new Promise((resolve) => setTimeout(resolve, 1000))
      if (!leader) {
        await this.triggerElection()
      } else {
        node.term = leader.term
      }
    }
  }

  private async setKey(key: string, value: string) {
    // In a real Raft, this would go through the log.
    // Here we just update the state if the leader is alive.
    const leader = this.clusterState.nodes.find((n) => n.role === "leader")
    const majorityAlive =
      this.clusterState.nodes.filter((n) => n.role !== "dead").length >=
      Math.ceil(this.clusterState.nodes.length / 2)
    if (leader && majorityAlive) {
      // Simulate delay for consensus
      await new Promise((resolve) => setTimeout(resolve, 1000))
      this.clusterState.keyValueStore[key] = value
    }
  }

  private async triggerElection() {
    // Simplified election: Find a new leader among alive nodes
    const aliveNodes = this.clusterState.nodes.filter((n) => n.role !== "dead")
    if (aliveNodes.length > 0) {
      // Reset all to followers first (or candidates)
      this.clusterState.nodes.forEach((n) => {
        if (n.role !== "dead") {
          n.role = "candidate"
          n.term += 1
        }
      })
      this.broadcastState()

      // Election timeout simulation
      await new Promise((resolve) => setTimeout(resolve, 1500))

      // If less than half are alive, no leader can be elected
      if (aliveNodes.length < Math.ceil(this.clusterState.nodes.length / 2)) {
        console.log("Not enough nodes to elect a leader")
        return
      }

      // Pick a random new leader
      const newLeaderIndex = Math.floor(Math.random() * aliveNodes.length)
      const newLeader = aliveNodes[newLeaderIndex]
      this.clusterState.nodes.forEach((n) => {
        if (n.role !== "dead") {
          n.role = "follower"
        }
      })
      newLeader.role = "leader"
      console.log(aliveNodes)
    }
  }
}
