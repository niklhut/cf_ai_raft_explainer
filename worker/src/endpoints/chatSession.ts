import { OpenAPIRoute } from "chanfana"
import { z } from "zod"
import type { AppContext } from "../types"
import type { RaftClusterState } from "@raft-simulator/shared"
import { createWorkersAI } from "workers-ai-provider"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import {
  convertToModelMessages,
  generateId,
  stepCountIs,
  streamText,
  tool,
  UIMessage,
} from "ai"
import { requireTurnstile } from "../utils/turnstile"

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
                model: z.string().optional(),
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
            schema: z.any(),
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
    await requireTurnstile(c)

    const data = await this.getValidatedData<typeof this.schema>()
    const { sessionId } = data.params
    const { messages, model: modelId } = data.body

    if (c.env.RATE_LIMITER) {
      const ip = c.req.header("CF-Connecting-IP") || "unknown"
      const { success } = await c.env.RATE_LIMITER.limit({ key: ip })
      if (!success) {
        return c.text("Rate limit exceeded", 429)
      }
    }

    let model
    if (modelId && modelId.startsWith("gemini")) {
      const apiKey = c.env.GOOGLE_GENERATIVE_AI_API_KEY
      if (!apiKey) {
        return c.text("Gemini API key not configured", 400)
      }
      const google = createGoogleGenerativeAI({ apiKey })
      model = google(modelId)
    } else if (modelId && modelId.startsWith("@cf")) {
      const workersai = createWorkersAI({ binding: c.env.AI })
      model = workersai(modelId as any)
    } else {
      const workersai = createWorkersAI({ binding: c.env.AI })
      model = workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast" as any)
    }
    console.log("Using model:", model)

    const id = c.env.RAFT_CLUSTER.idFromString(sessionId)
    const stub = c.env.RAFT_CLUSTER.get(id)

    // Get Current State
    const oldStateRes = await stub.fetch("https://dummy/getState")
    const oldState = (await oldStateRes.json()) as RaftClusterState
    const filteredOldState = this.filterState(oldState)

    // Persist user message
    const lastUserMessage = {
      ...messages[messages.length - 1],
      id: generateId(),
    } as UIMessage
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
      abortSignal: c.req.raw.signal,
      system: `You are the **Raft Consensus Algorithm Simulator Narrator and Expert Tutor**. Your primary goal is to guide the user through Raft concepts by simulating and explaining state changes in the cluster.

The cluster's current state is provided below. You have access to the \`changeClusterState\` tool to simulate user-requested actions.

Current Raft Cluster State: ${JSON.stringify(filteredOldState)}

### Instructions for Response Generation:

1.  **Tool Use:** Use the \`changeClusterState\` tool *only* when the user explicitly requests an action that changes the cluster state (e.g., "fail node 2", "set x=10").
2.  **Narrative Style:** Always respond in a **conversational and educational narrative** style. Do not output raw JSON, tool calls, or internal notes.
3.  **Explain the Change:** If an action is taken and the state updates, your response MUST cover three points in a clear narrative:
    * **The Action:** What the user requested.
    * **The Result:** The exact, specific changes in the cluster state (e.g., "Node 3 failed," "The key 'x' was updated to '10'," "Node 1 became the new leader").
    * **The Raft Principle:** Explain the **Raft mechanism** that governed this change (e.g., "This triggered a new election cycle," "The log entry was successfully replicated to a majority," "The leader committed the new entry.").
4.  **No Change/Error:** If the tool is called but no significant state change occurs, explain *why* based on Raft rules (e.g., "The node was already down, so the command was ignored by the system," or "The command was rejected because the current node is not the leader.").`,
      messages: convertToModelMessages(messages as UIMessage[]),
      tools: {
        changeClusterState: changeClusterStateTool,
      },
      stopWhen: stepCountIs(5),
      onFinish: async ({ text }) => {
        const assistantMessage: UIMessage = {
          id: generateId(),
          role: "assistant",
          parts: [{ type: "text", text }],
        }

        await stub.fetch("https://dummy/addHistory", {
          method: "POST",
          body: JSON.stringify({ messages: [assistantMessage] }),
          headers: { "Content-Type": "application/json" },
        })
      },
    })

    // return result.toUIMessageStreamResponse({
    //   headers: {
    //     "Content-Type": "text/x-unknown",
    //     "content-encoding": "identity",
    //     "transfer-encoding": "chunked",
    //   },
    // })

    return result.toUIMessageStreamResponse()
  }
}
