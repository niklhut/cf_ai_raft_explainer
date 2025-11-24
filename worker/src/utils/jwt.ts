import { sign, verify } from "hono/jwt"
import type { AppContext } from "../types"
import { HTTPException } from "hono/http-exception"

export async function createSessionToken(c: AppContext, payload: object = {}) {
  const secret = c.env.TURNSTILE_SECRET_KEY
  const token = await sign(
    {
      ...payload,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24 hours
    },
    secret,
  )
  return token
}

export async function verifySessionToken(token: string, secret: string) {
  try {
    return await verify(token, secret)
  } catch (e) {
    throw new HTTPException(401, { message: "Invalid session token" })
  }
}
