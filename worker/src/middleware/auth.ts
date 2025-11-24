import { HTTPException } from "hono/http-exception"
import type { AppContext } from "../types"
import { verifySessionToken } from "../utils/jwt"

export async function requireAuth(c: AppContext): Promise<void> {
  let token: string | undefined

  const authHeader = c.req.header("Authorization")
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1]
  } else {
    token = c.req.query("token")
  }
  console.log("Auth token:", token)

  if (!token) {
    throw new HTTPException(401, {
      message:
        "Authentication Failed: Missing or invalid Authorization header or token query parameter.",
    })
  }

  const secret = c.env.TURNSTILE_SECRET_KEY

  await verifySessionToken(token, secret)
}
