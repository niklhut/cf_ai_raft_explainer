import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { HTTPException } from "hono/http-exception";
import type { AppContext } from "../types";
import { verifyTurnstileToken } from "../utils/turnstile";

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
    const token = c.req.header('X-Turnstile-Token');
    if (!token) {
      throw new HTTPException(401, { message: "Missing Turnstile token" });
    }

    const ip = c.req.header('CF-Connecting-IP');
    const isValid = await verifyTurnstileToken(token, c.env, ip);

    if (!isValid) {
      throw new HTTPException(403, { message: "Invalid Turnstile token" });
    }

    const id = c.env.RAFT_CLUSTER.newUniqueId();
    return c.json({ sessionId: id.toString() });
  }
}
