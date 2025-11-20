import { OpenAPIRoute } from "chanfana"
import { z } from "zod"
import type { AppContext } from "../types"

export class WebsocketSession extends OpenAPIRoute {
  schema = {
    tags: ["Chat"],
    summary: "Connect to the chat session via WebSocket",
    request: {
      params: z.object({
        sessionId: z.string(),
      }),
      headers: z.object({
        Upgrade: z.string().optional(),
      }),
    },
    responses: {
      "101": {
        description: "WebSocket upgrade",
      },
      "400": { description: "Missing session ID" },
      "426": { description: "Upgrade Required" },
    },
  }

  async handle(c: AppContext) {
    const data = await this.getValidatedData<typeof this.schema>()
    const sessionId = data.params.sessionId
    const upgradeHeader = data.headers.Upgrade?.toLowerCase()

    if (upgradeHeader !== "websocket") {
      return c.text("Expected Upgrade: websocket", 426)
    }

    const id = c.env.RAFT_CLUSTER.idFromString(sessionId)
    const stub = c.env.RAFT_CLUSTER.get(id)

    const doResponse = await stub.fetch("https://dummy/websocket", c.req.raw)
    return doResponse
  }
}
