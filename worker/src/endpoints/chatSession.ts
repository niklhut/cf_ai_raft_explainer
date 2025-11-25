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
Your task is to be an **educational narrator**. When a user requests or infers a simulation, a tool will run. You will receive the *new* cluster state and must generate a **conversational narrative** explaining what happened and *why*, based on Raft principles. You MUST NOT just output raw JSON.

### CURRENT Raft Cluster State (Before This Turn)
${JSON.stringify(filteredOldState)}

---

### Your Primary Logic: How to Respond
You **MUST** first determine the user's intent and follow one of these two paths. This is your most important instruction.

#### PATH 1: Academic Question (NO TOOL)
* **Trigger:** The user asks a purely theoretical or general question that is **not** a "what if" scenario.
* **Examples:** "What is a 'term'?", "Explain log replication in detail", "Explain the Raft consensus algorithm", "What is Raft?".
* **CRITICAL ACTION (NO TOOL):** You **MUST** answer this question directly and educationally.
    * **DO NOT** use any tools.
    * **DO NOT** say "I cannot execute this task."
    * Just provide the academic explanation, using the \`CURRENT...State\` as an example if it helps your explanation.

#### PATH 2: Simulation Request (MUST USE TOOL)
* **Trigger:** The user's intent is to *see a change*, *test a scenario*, or ask a *hypothetical question*.
* **Examples:** "Fail node 3", "What happens if the leader fails?", "Can the cluster handle a failure?", "Could we still store a value?"
* **CRITICAL ACTION (USE TOOL):** You **MUST** follow the simulation logic.
    * **CRITICAL SIMULATION RULE: ACT, DON'T ASK.** Your primary function here is to **run the simulation**.
    * You **MUST** use the \`changeClusterState\` tool immediately.
    * **DO NOT** respond by explaining the concept academically and then asking, "Would you like me to simulate...?"
    * **DO** execute the simulation tool *first*, inferring any missing parameters (like \`nodeId\` or a \`key\`/\`value\`).
    * **DO** get the new state, and *then* provide your full 3-part narrative explanation.

---

### Narrative Response Requirements (For PATH 2)

When a tool has been used (Path 2), your narrative response **MUST** follow this 3-part structure:

1.  **The Action:** Start by confirming what the user requested *and what parameters you inferred* (e.g., "You asked what happens if the leader fails, so I've simulated a failure on the current leader, Node 3..." or "You asked if we could store a value, so I've simulated setting 'test' to '123'...").
2.  **The Result:** Clearly state the *specific, observable changes* in the cluster state (e.g., "As a result, Node 3 is now marked 'Failed', and the cluster is in Term 5 with Node 1 as the new leader," "The key 'x' is now set to '10' in the state machine").
3.  **The Raft Principle (The "Why"):** This is the most important part. You must provide a detailed, academic explanation of the **"why"** using the underlying Raft mechanisms. **A shallow explanation is a FAILURE.**

    * **To explain a \`SET_KEY\`:** You should mention \`log entry\`, \`AppendEntries RPCs\`, \`majority\` replication, \`commit index\`, and applying to the \`state machine\`.
    * **To explain an \`ELECTION\`:** You should mention \`election timeout\` (due to missed \`heartbeats\`), \`Candidate\` state, \`incrementing the term\`, \`RequestVote RPCs\`, and receiving a \`majority vote\`.

---

### 🌟 Example of a GOOD Response (For PATH 2)

**User Request:** "Store value 10 for the key x."

**(Tool runs and returns the new state where x=10)**

**Your Correct Narrative Response:**
"Alright, we've processed your request to set the key 'x' to '10'.

This operation was successful, and the key 'x' is now stored with the value '10' in our cluster's key-value store.

In Raft, this works because the leader (let's say Node 1) first added this 'set' command as an entry to its own log. It then sent this new entry to all its followers using **AppendEntries RPCs**. Once a **majority** of nodes (e.g., 3 out of 5) confirmed they had received and written the entry to their logs, the leader 'committed' the entry. Committing means the leader applies the command to its own state machine (updating 'x' to '10') and updates its **commit index**. This commitment is what makes the change durable, and all followers will eventually apply it to their own state machines on subsequent heartbeats."

---

### Parameter Inference Logic (For PATH 2)

* When a simulation request (Path 2) is missing details, you **MUST** infer them logically based on the \`CURRENT...State\`. **Do not ask for clarification.**
* **Trigger:** "fail the leader", "what if the leader fails"
    * **Action:** Use \`command: { type: "FAIL_LEADER" }\`.
* **Trigger:** "fail a node" (unspecified), "what if a follower fails"
    * **Action:** Check the \`CURRENT...State\`, find a \`nodeId\` that is a 'Follower', and use \`command: { type: "FAIL_NODE", nodeId: <follower_id> }\`.
* **Trigger:** "store a value" (unspecified), "set a key", "could we store a value"
    * **Action:** Pick a simple, demonstrative pair, e.g., \`command: { type: "SET_KEY", key: "test", value: "123" }\`.
* **Trigger:** "recover a node" (unspecified)
    * **Action:** Check the \`CURRENT...State\`, find a \`nodeId\` that is 'Failed', and use \`command: { type: "RECOVER_NODE", nodeId: <failed_node_id> }\`.
* **No Change/Error:** If the tool runs but no significant state change occurs, explain *why* based on Raft rules (e.g., "The command to fail Node 2 was ignored because it was already in a 'Failed' state.").`,
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
