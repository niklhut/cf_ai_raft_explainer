import { OpenAPIRoute } from "chanfana"
import { z } from "zod"
import type { AppContext } from "../types"
import { verifyTurnstile } from "../utils/turnstile"
import { createSessionToken } from "../utils/jwt"
import { HTTPException } from "hono/http-exception"

export class AuthVerify extends OpenAPIRoute {
  schema = {
    tags: ["Auth"],
    summary: "Verify Turnstile token and get session token",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              token: z.string(),
            }),
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Returns a session token",
        content: {
          "application/json": {
            schema: z.object({
              token: z.string(),
            }),
          },
        },
      },
      "400": { description: "Missing Turnstile token" },
      "403": { description: "Turnstile verification failed" },
    },
  }

  async handle(c: AppContext) {
    const data = await this.getValidatedData<typeof this.schema>()
    const { token } = data.body

    const secretKey = c.env.TURNSTILE_SECRET_KEY
    const remoteIp = c.req.header("CF-Connecting-IP") || ""

    const validationResult = await verifyTurnstile(token, secretKey, remoteIp)

    if (!validationResult.success) {
      console.error(
        "Turnstile validation failed:",
        validationResult["error-codes"],
      )
      throw new HTTPException(403, {
        message: "Access Denied: Turnstile verification failed.",
      })
    }

    const sessionToken = await createSessionToken(c)

    return c.json({ token: sessionToken })
  }
}
