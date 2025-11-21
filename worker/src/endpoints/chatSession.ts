import { OpenAPIRoute } from "chanfana"
import { z } from "zod"
import type { AppContext } from "../types"
import type { RaftClusterState } from "@raft-simulator/shared"
import { createWorkersAI } from "workers-ai-provider"
import { generateObject, streamText } from "ai"

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
        description: "Returns the AI response stream",
        content: {
          "text/plain": {
            schema: z.string(),
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

    const workersai = createWorkersAI({ binding: c.env.AI })
    const model = workersai("@cf/meta/llama-3-8b-instruct")

    // 1. Get Command from AI
    const { object: parsedAi } = await generateObject({
      model,
      schema: z.object({
        command: z.object({
          type: z.enum([
            "FAIL_LEADER",
            "FAIL_NODE",
            "RECOVER_NODE",
            "SET_KEY",
            "NO_OP",
          ]),
          nodeId: z.number().optional(),
          key: z.string().optional(),
          value: z.string().optional(),
        }),
      }),
      system: `You are a Raft Consensus Algorithm simulator assistant.

Your ONLY task is to interpret the user's command and output a single JSON object that strictly adheres to the requested schema for the next action in the Raft cluster. DO NOT include any text, explanations, or commentary outside of the JSON object.

Schema constraints for the 'command' object:
- 'type' MUST be one of: "FAIL_LEADER", "FAIL_NODE", "RECOVER_NODE", "SET_KEY", "NO_OP".
- 'nodeId' is a number and is required ONLY for FAIL_NODE and RECOVER_NODE.
- 'key' and 'value' are strings and are required ONLY for SET_KEY.

Examples:
User: "fail leader" -> JSON: { "command": { "type": "FAIL_LEADER" } }
User: "fail node 2" -> JSON: { "command": { "type": "FAIL_NODE", "nodeId": 2 } }
User: "set x to 10" -> JSON: { "command": { "type": "SET_KEY", "key": "x", "value": "10" } }
User: "hello" -> JSON: { "command": { "type": "NO_OP" } }
`,
      prompt: prompt,
    })

    console.log("LLM response for command:", parsedAi)

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

    // 4. Explain with AI (Streaming)
    const filterState = (s: RaftClusterState) => ({
      nodes: s.nodes,
      keyValueStore: s.keyValueStore,
    })

    const lastMessages = oldState.chatHistory.slice(-5)

    const result = streamText({
      model,
      system: `You are a Raft Consensus Algorithm expert and a simulator narrator. Your task is to provide a concise, natural-sounding, and highly informative explanation of what just occurred in the Raft cluster.

Instructions:
1. **Persona:** Speak as a domain expert describing the outcome of a single action.
2. **Context:** Use the 'Command Executed', 'Old State', 'New State', and 'LastError' data as *internal knowledge* to construct your explanation. DO NOT explicitly mention the terms "Old State," "New State," "Command Executed," or "LastError" in your response.
3. **Focus:** Clearly identify the **event**, the **outcome**, and the **Raft mechanism** that caused the transition.
4. **Tone:** The explanation should be professional, insightful, and flow naturally, directly addressing the user's inquiry (via the 'prompt' in the messages list).

---
FACTS TO INCORPORATE:
Command Executed: ${JSON.stringify(parsedAi.command)}
Old State: ${JSON.stringify(filterState(oldState))}
New State: ${JSON.stringify(filterState(newState))}
${newState.lastError ? `LastError: ${newState.lastError || "none"}` : ""}
---

Now, based on these facts, explain the changes and answer the user.`,
      messages: [
        ...lastMessages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: prompt },
      ],
      onFinish: async ({ text }) => {
        console.log("LLM explanation:", text)
        // 5. Add History (Async)
        await stub.fetch("https://dummy/addHistory", {
          method: "POST",
          body: JSON.stringify({ prompt, explanation: text }),
          headers: { "Content-Type": "application/json" },
        })
      },
    })

    // Return the stream response
    return result.toTextStreamResponse({
      headers: {
        "X-Raft-State": JSON.stringify(newState),
      },
    })
  }
}
