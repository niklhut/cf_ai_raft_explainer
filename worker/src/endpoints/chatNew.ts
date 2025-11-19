import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../types";

export class ChatNew extends OpenAPIRoute {
  schema = {
    tags: ["Chat"],
    summary: "Create a new chat session",
    responses: {
      "200": {
        description: "Returns a new session ID",
        content: {
          "application/json": {
            schema: z.object({
              sessionId: z.string(),
            }),
          },
        },
      },
    },
  };

  async handle(c: AppContext) {
    const id = c.env.RAFT_CLUSTER.newUniqueId();
    return c.json({ sessionId: id.toString() });
  }
}
