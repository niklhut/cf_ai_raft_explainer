import { OpenAPIRoute } from "chanfana"
import { z } from "zod"
import type { AppContext } from "../types"
import type { RaftClusterState } from "@raft-simulator/shared"

export class ChatSession extends OpenAPIRoute {
  schema = {
    tags: ["Chat"],
    summary: "Send a message to the chat session",
    request: {
      params: z.object({
        sessionId: z.string(),
      }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              prompt: z.string(),
            }),
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Returns the AI response and updated state",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean().optional(),
              state: z.any().optional(),
              error: z.string().optional(),
            }),
          },
        },
      },
      "400": { description: "Missing session ID" },
      "429": { description: "Rate limit exceeded" },
    },
  }

  async handle(c: AppContext) {
    const data = await this.getValidatedData<typeof this.schema>()
    const { sessionId } = data.params
    const { prompt } = data.body

    if (c.env.RATE_LIMITER) {
      const ip = c.req.header("CF-Connecting-IP") || "unknown"
      const { success } = await c.env.RATE_LIMITER.limit({ key: ip })
      if (!success) {
        return c.text("Rate limit exceeded", 429)
      }
    }

    // 1. Get Command from AI
    const aiCommandResponse = await c.env.AI.run(
      "@cf/meta/llama-3-8b-instruct",
      {
        messages: [
          {
            role: "system",
            content: `You are a Raft Consensus Algorithm simulator assistant. Interpret user commands into structured JSON.
          
          Commands:
          - FAIL_LEADER: "fail leader", "kill leader"
          - FAIL_NODE: "fail node 2" (requires nodeId)
          - RECOVER_NODE: "recover node 2" (requires nodeId)
          - SET_KEY: "set x to 10" (requires key, value, or only key to unset value)
          - NO_OP: General chat or invalid commands.

          Output JSON ONLY:
          {
            "command": { "type": "FAIL_LEADER" | "FAIL_NODE" | "RECOVER_NODE" | "SET_KEY" | "NO_OP", "nodeId": number, "key": string, "value": string }
          }`,
          },
          { role: "user", content: prompt },
        ],
      },
    )

    let parsedAi: {
      command: { type: string; nodeId?: number; key?: string; value?: string }
    }
    try {
      const cleanJson = (aiCommandResponse as any).response
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim()
      parsedAi = JSON.parse(cleanJson)
    } catch (e) {
      console.error("Failed to parse AI response", e)
      parsedAi = {
        command: { type: "NO_OP" },
      }
    }

    const id = c.env.RAFT_CLUSTER.idFromString(sessionId)
    const stub = c.env.RAFT_CLUSTER.get(id)

    // 2. Get Current State
    const oldStateRes = await stub.fetch("https://dummy/getState")
    const oldState = (await oldStateRes.json()) as RaftClusterState

    // 3. Execute Command
    const executeRes = await stub.fetch("https://dummy/execute", {
      method: "POST",
      body: JSON.stringify({ command: parsedAi.command }),
      headers: { "Content-Type": "application/json" },
    })
    const newState = (await executeRes.json()) as RaftClusterState

    // 4. Explain with AI
    const filterState = (s: RaftClusterState) => ({
      nodes: s.nodes,
      keyValueStore: s.keyValueStore,
    })

    const lastMessages = oldState.chatHistory.slice(-5)

    const aiExplainResponse = await c.env.AI.run(
      "@cf/meta/llama-3-8b-instruct",
      {
        messages: [
          {
            role: "system",
            content: `You are a Raft Consensus expert. Explain what happened based on the state change.
          User Prompt: ${prompt}
          Command Executed: ${JSON.stringify(parsedAi.command)}
          Old State: ${JSON.stringify(filterState(oldState))}
          New State: ${JSON.stringify(filterState(newState))}
          LastError: ${newState.lastError || "none"}
          
          Explain the state change and answer the user.`,
          },
          ...lastMessages.map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: prompt },
        ],
      },
    )

    const explanation = (aiExplainResponse as any).response

    // 5. Add History
    await stub.fetch("https://dummy/addHistory", {
      method: "POST",
      body: JSON.stringify({ prompt, explanation }),
      headers: { "Content-Type": "application/json" },
    })

    return c.json({ success: true, state: newState })
  }
}
