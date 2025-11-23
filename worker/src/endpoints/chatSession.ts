import { OpenAPIRoute } from "chanfana"
import { z } from "zod"
import type { AppContext } from "../types"
import type { RaftClusterState } from "@raft-simulator/shared"
import { createWorkersAI } from "workers-ai-provider"
import { convertToModelMessages, stepCountIs, streamText, tool, UIMessage } from "ai"

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
            schema: z
              .object({
                messages: z.array(
                  z.object({
                    role: z.string(),
                    content: z.string().optional(),
                    parts: z.array(z.any()).optional(),
                  }),
                ),
              })
              .passthrough(),
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Returns the AI response stream",
        content: {
          "text/event-stream": {
            schema: z.string(),
          },
        },
      },
      "400": { description: "Missing session ID" },
      "429": { description: "Rate limit exceeded" },
    },
  }

  filterState(s: RaftClusterState, includeLastError = false) {
    return {
      nodes: s.nodes,
      keyValueStore: s.keyValueStore,
      ...(includeLastError && s.lastError ? { lastError: s.lastError } : {}),
    }
  }

  async handle(c: AppContext) {
    const data = await this.getValidatedData<typeof this.schema>()
    const { sessionId } = data.params
    const { messages } = data.body

    if (c.env.RATE_LIMITER) {
      const ip = c.req.header("CF-Connecting-IP") || "unknown"
      const { success } = await c.env.RATE_LIMITER.limit({ key: ip })
      if (!success) {
        return c.text("Rate limit exceeded", 429)
      }
    }

    const workersai = createWorkersAI({ binding: c.env.AI })
    const model = workersai("@cf/meta/llama-4-scout-17b-16e-instruct" as any)

    const id = c.env.RAFT_CLUSTER.idFromString(sessionId)
    const stub = c.env.RAFT_CLUSTER.get(id)

    // Get Current State
    const oldStateRes = await stub.fetch("https://dummy/getState")
    const oldState = (await oldStateRes.json()) as RaftClusterState
    const filteredOldState = this.filterState(oldState)

    // Persist user message
    const lastUserMessage = messages[messages.length - 1]
    if (lastUserMessage && lastUserMessage.role === "user") {
      await stub.fetch("https://dummy/addHistory", {
        method: "POST",
        body: JSON.stringify({ messages: [lastUserMessage] }),
        headers: { "Content-Type": "application/json" },
      })
    }

    const changeClusterStateTool = tool({
      description:
        "A tool used to simulate an event or command in the Raft cluster, such as failing a node, recovering a node, or setting a key/value. Use this tool when the user requests an action that changes the cluster state.",
      inputSchema: z.object({
        command: z.object({
          type: z
            .enum(["FAIL_LEADER", "FAIL_NODE", "RECOVER_NODE", "SET_KEY"])
            .describe(
              "The specific type of Raft simulation command to execute.",
            ),
          nodeId: z
            .number()
            .optional()
            .describe(
              "The ID of the node (e.g., 1, 2, 3) to target. Required for FAIL_NODE and RECOVER_NODE.",
            ),
          key: z
            .string()
            .optional()
            .describe("The key name for SET_KEY commands."),
          value: z
            .string()
            .optional()
            .describe(
              "The value to associate with the key for SET_KEY commands, empty if key should be deleted.",
            ),
        }),
      }),
      execute: async ({ command }) => {
        console.log("Executing command via tool:", command)
        const res = await stub.fetch("https://dummy/execute", {
          method: "POST",
          body: JSON.stringify({ command }),
        })
        const newState = (await res.json()) as RaftClusterState
        return this.filterState(newState, true)
      },
    })

    const result = streamText({
      model,
      system: `You are a Raft Consensus Algorithm expert and a simulator narrator.
You have access to the 'changeClusterState' tool to simulate events.

Current Raft Cluster State: ${JSON.stringify(filteredOldState)}

Instructions:
1. When the user requests an action (e.g., 'fail node 3', 'set x=10'), you MUST use the 'changeClusterState' tool with the correct parameters.
2. After the tool returns the new cluster state, use your expertise to provide a detailed, insightful, and concise explanation of what happened in the cluster based on the change (e.g., 'Node 2 was elected leader in term 5 due to the failure of the previous leader').
3. If the user asks a theoretical question, answer it directly using your knowledge and the Current Cluster State as context.`,
      messages: convertToModelMessages(messages as UIMessage[]),
      tools: {
        changeClusterState: changeClusterStateTool,
      },
      onFinish: async ({ response }) => {
        await stub.fetch("https://dummy/addHistory", {
          method: "POST",
          body: JSON.stringify({ messages: response.messages }),
          headers: { "Content-Type": "application/json" },
        })
      },
      stopWhen: stepCountIs(5)
    })

    return result.toTextStreamResponse({
      headers: {
        "Content-Type": "text/x-unknown",
        "content-encoding": "identity",
        "transfer-encoding": "chunked",
      },
    })
  }
}
