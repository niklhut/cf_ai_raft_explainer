import type { Context } from "hono";

export interface Env {
  RAFT_CLUSTER: DurableObjectNamespace;
  AI: any;
  RATE_LIMITER: any;
}

export type AppContext = Context<{ Bindings: Env }>;
