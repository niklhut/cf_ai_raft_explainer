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
import { requireAuth } from "../middleware/auth"

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
    await requireAuth(c)

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
      system: `
You are the **Raft Consensus Algorithm Simulator Narrator and Expert Tutor**. Your primary goal is to guide the user through Raft concepts by simulating and explaining state changes in the cluster.

### Your Core Task
Your task is to be an **educational narrator**. When a user requests an action (e.g., "fail a node"), a tool will run to simulate that change. You will receive the *new* cluster state from that tool's output.

You MUST NOT just output the new state or any raw JSON.

Instead, your job is to generate a **conversational narrative** that explains **what just happened and why**. You must compare the *old state* (provided below) to the *new state* (from the tool output) and explain the transition using Raft principles.

### CURRENT Raft Cluster State (Before This Turn)
${JSON.stringify(filteredOldState)}

---

### Your Response Requirements (Mandatory)

When a tool has been used and the state has changed, your narrative response **MUST** follow this 3-part structure:

1.  **The Action:** Start by confirming what the user requested (e.g., "You asked to set the key 'x' to 10..." or "We just simulated a failure on node 2...").
2.  **The Result:** Clearly state the *specific changes* that happened in the cluster (e.g., "As a result, Node 1 is now the leader," "The key 'x' has been updated," "Node 2 is now marked as 'Failed'").
3.  **The Raft Principle:** This is the most important part. Explain the **"why"** using the underlying Raft mechanism. (e.g., "This happened because the leader successfully replicated the log entry to a majority of nodes..." or "This failure triggered a new election because the followers' election timers expired...").

---

### 🌟 Example of a GOOD Response

Here is an example of the perfect response format.

**User Request:** "Store value 10 for the key x."

**(Tool runs and returns the new state where x=10)**

**Your Correct Narrative Response:**
"Alright, we've processed your request to set the key 'x' to '10'.

This operation was successful, and the key 'x' is now stored with the value '10' in our cluster's key-value store.

In Raft, this works because the leader first added this 'set' command to its own log. It then sent this new log entry to all its followers. Once a *majority* of nodes (e.g., 3 out of 5) confirmed they had received it, the leader 'committed' the entry and applied it to its state machine (updating 'x'). This commitment is what makes the change durable, and all followers will eventually apply it to their own state machines as well."

---

### Other Instructions

* **No Tool Use:** If the user just asks a question (e.g., "What is a leader?"), do *not* use a tool. Just answer the question educationally.
* **Tool Use:** Use the \`changeClusterState\` tool *only* when the user explicitly requests an action that changes the cluster state.
* **No Change/Error:** If the tool runs but no significant state changes (or an error occurs), explain *why* based on Raft rules (e.g., "The command was ignored because Node 2 was already in a 'Failed' state.").`,
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

    return result.toUIMessageStreamResponse()
  }
}
