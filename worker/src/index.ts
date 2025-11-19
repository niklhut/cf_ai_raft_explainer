// import { fromHono } from "chanfana";
// import { Hono } from "hono";
// import { TaskCreate } from "./endpoints/taskCreate";
// import { TaskDelete } from "./endpoints/taskDelete";
// import { TaskFetch } from "./endpoints/taskFetch";
// import { TaskList } from "./endpoints/taskList";

// // Start a Hono app
// const app = new Hono<{ Bindings: Env }>();

// // Setup OpenAPI registry
// const openapi = fromHono(app, {
// 	docs_url: "/",
// });

// // Register OpenAPI endpoints
// openapi.get("/api/tasks", TaskList);
// openapi.post("/api/tasks", TaskCreate);
// openapi.get("/api/tasks/:taskSlug", TaskFetch);
// openapi.delete("/api/tasks/:taskSlug", TaskDelete);

// // You may also register routes for non OpenAPI directly on Hono
// // app.get('/test', (c) => c.text('Hono!'))

// // Export the Hono app
// export default app;

import { RaftCluster } from "./raft-cluster"
import type { RaftCommand } from "@raft-simulator/shared"

export interface Env {
  RAFT_CLUSTER: DurableObjectNamespace
  AI: any
  RATE_LIMITER: any
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders })
    }

    // 1. Create New Session
    if (url.pathname === "/api/chat/new") {
      const id = env.RAFT_CLUSTER.newUniqueId()
      return new Response(JSON.stringify({ sessionId: id.toString() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // 2. Chat Endpoint
    if (url.pathname.startsWith("/api/chat/")) {
      const sessionId = url.pathname.split("/")[3]
      if (!sessionId)
        return new Response("Missing session ID", {
          status: 400,
          headers: corsHeaders,
        })

      if (env.RATE_LIMITER) {
        const ip = request.headers.get("CF-Connecting-IP") || "unknown"
        const { success } = await env.RATE_LIMITER.limit({ key: ip })
        if (!success)
          return new Response("Rate limit exceeded", {
            status: 429,
            headers: corsHeaders,
          })
      }

      const { prompt } = (await request.json()) as { prompt: string }

      // Call Workers AI to interpret command
      const aiResponse = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
        messages: [
          {
            role: "system",
            content: `You are a Raft Consensus Algorithm simulator assistant. Interpret user commands into structured JSON.
            
            Commands:
            - FAIL_LEADER: "fail leader", "kill leader"
            - FAIL_NODE: "fail node 2" (requires nodeId)
            - RECOVER_NODE: "recover node 2" (requires nodeId)
            - SET_KEY: "set x to 10" (requires key, value)
            - NO_OP: General chat or invalid commands.

            Output JSON ONLY:
            {
              "command": { "type": "FAIL_LEADER" | "FAIL_NODE" | "RECOVER_NODE" | "SET_KEY" | "NO_OP", "nodeId": number, "key": string, "value": string },
              "explanation": "Short explanation for the user."
            }`,
          },
          { role: "user", content: prompt },
        ],
      })

      // Parse AI response (handling potential extra text if model is chatty, though system prompt says JSON ONLY)
      // Simple parsing assuming the model behaves well or we might need more robust parsing
      let parsedAi
      try {
        // Sometimes models wrap JSON in markdown code blocks
        const cleanJson = (aiResponse as any).response
          .replace(/```json/g, "")
          .replace(/```/g, "")
          .trim()
        parsedAi = JSON.parse(cleanJson)
      } catch (e) {
        console.error("Failed to parse AI response", e)
        parsedAi = {
          command: { type: "NO_OP" },
          explanation:
            "I couldn't understand that command, but I'm here to help with Raft!",
        }
      }

      // Forward to Durable Object
      const id = env.RAFT_CLUSTER.idFromString(sessionId)
      const stub = env.RAFT_CLUSTER.get(id)

      const doResponse = await stub.fetch("https://dummy/chat", {
        method: "POST",
        body: JSON.stringify({
          prompt,
          command: parsedAi.command,
          explanation: parsedAi.explanation,
        }),
        headers: { "Content-Type": "application/json" },
      })

      const data = await doResponse.json()
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // 3. Get State Endpoint
    if (url.pathname.startsWith("/api/state/")) {
      const sessionId = url.pathname.split("/")[3]
      if (!sessionId)
        return new Response("Missing session ID", {
          status: 400,
          headers: corsHeaders,
        })

      const id = env.RAFT_CLUSTER.idFromString(sessionId)
      const stub = env.RAFT_CLUSTER.get(id)

      const doResponse = await stub.fetch("https://dummy/getState")
      const data = await doResponse.json()

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    return new Response("Not found", { status: 404, headers: corsHeaders })
  },
}

export { RaftCluster }
