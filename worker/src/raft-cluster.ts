import type { Env } from "./index"
import type { NodeState } from "@raft-simulator/shared"

export class RaftCluster {
  private state: DurableObjectState
  private clusterState: NodeState[]

  constructor(state: DurableObjectState, private env: Env) {
    this.state = state
    this.state.blockConcurrencyWhile(async () => {
      this.clusterState = await this.state.storage.get("clusterState") || [
        { id: 1, role: "leader", term: 0, alive: true },
        { id: 2, role: "follower", term: 0, alive: true },
        { id: 3, role: "follower", term: 0, alive: true },
        { id: 4, role: "follower", term: 0, alive: true },
        { id: 5, role: "follower", term: 0, alive: true },
      ]
    })
  }

  async fetch(request: Request) {
    const url = new URL(request.url);

    if (url.pathname === "/getState") {
      return this.getState();
    }

    if (url.pathname === "/chat") {
      return this.handleChat(request);
    }

    return new Response("Not found", { status: 404 });
  }

  async getState() {
    const data = await this.state.storage.get("cluster") || {
      nodes: [],
      term: 0,
      keyValueStore: {},
      chatHistory: []
    };

    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" }
    });
  }

  async handleChat(request: Request) {
    const body = await request.json();
    // command + user prompt come in here
    return new Response(JSON.stringify({ ok: true }));
  }
}
