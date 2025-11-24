import type { Context } from "hono";

export interface Env {
  RAFT_CLUSTER: DurableObjectNamespace;
  AI: any;
  RATE_LIMITER: any;
  GOOGLE_GENERATIVE_AI_API_KEY: string;
  TURNSTILE_SECRET_KEY: string;
}

export type AppContext = Context<{ Bindings: Env }>;
