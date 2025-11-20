import { fromHono } from "chanfana";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { ChatNew } from "./endpoints/chatNew";
import { ChatSession } from "./endpoints/chatSession";
import { StateSession } from "./endpoints/stateSession";
import { WebsocketSession } from "./endpoints/websocketSession";
import type { Env } from "./types";

// Start a Hono app
const app = new Hono<{ Bindings: Env }>();

// Setup CORS
app.use("/*", cors());

// Setup OpenAPI registry
const openapi = fromHono(app, {
  docs_url: "/",
});

// Register OpenAPI endpoints
openapi.post("/api/chat/new", ChatNew);
openapi.post("/api/chat/:sessionId", ChatSession);
openapi.get("/api/state/:sessionId", StateSession);
openapi.get("/api/ws/:sessionId", WebsocketSession);

// Export the Hono app
export default app;

export { RaftCluster } from "./raft-cluster";
