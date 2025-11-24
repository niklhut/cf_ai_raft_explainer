import { HTTPException } from "hono/http-exception"
import type { AppContext, Env } from "../types"
import { getCookie } from "hono/cookie"

interface TurnstileVerificationResult {
  success: boolean
  "error-codes": string[]
}

export async function verifyTurnstile(
  token: string,
  secretKey: string,
  remoteIp: string,
): Promise<TurnstileVerificationResult> {
  const validationUrl =
    "https://challenges.cloudflare.com/turnstile/v0/siteverify"
  const validationData = new FormData()
  validationData.append("secret", secretKey)
  validationData.append("response", token)
  validationData.append("remoteip", remoteIp)

  const validationResponse = await fetch(validationUrl, {
    method: "POST",
    body: validationData,
  })

  return validationResponse.json() as Promise<TurnstileVerificationResult>
}

export async function requireTurnstile(c: AppContext): Promise<void> {
  const token =
    c.req.header("X-Turnstile-Token") ?? getCookie(c, "turnstile_token")

  if (!token) {
    throw new HTTPException(401, {
      message: "Authentication Failed: Missing 'turnstile_token' cookie.",
    })
  }

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
}
