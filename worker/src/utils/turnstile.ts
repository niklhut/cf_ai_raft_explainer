import type { Env } from "../types";

export async function verifyTurnstileToken(token: string, env: Env, ip?: string): Promise<boolean> {
  const formData = new FormData();
  formData.append('secret', env.TURNSTILE_SECRET_KEY);
  formData.append('response', token);
  if (ip) {
    formData.append('remoteip', ip);
  }

  const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    body: formData,
    method: 'POST',
  });

  const outcome = await result.json() as any;
  return outcome.success;
}
