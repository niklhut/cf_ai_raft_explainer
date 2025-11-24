import { OpenAPIRoute } from "chanfana"
import { z } from "zod"
import type { AppContext } from "../types"
import { requireAuth } from "../middleware/auth"

export class StateSession extends OpenAPIRoute {
  schema = {
    tags: ["State"],
    summary: "Get the current state of the session",
    request: {
      params: z.object({
        sessionId: z.string(),
      }),
    },
    responses: {
      "200": {
        description: "Returns the full state",
        content: {
          "application/json": {
            schema: z.any(),
          },
        },
      },
    },
  }

  async handle(c: AppContext) {
    await requireAuth(c)

    const data = await this.getValidatedData<typeof this.schema>()

    const id = c.env.RAFT_CLUSTER.idFromString(data.params.sessionId)
    const stub = c.env.RAFT_CLUSTER.get(id)

    const doResponse = await stub.fetch("https://dummy/getState")
    const responseData = await doResponse.json()
    return c.json(responseData)
  }
}
