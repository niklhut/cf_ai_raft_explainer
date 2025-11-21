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

    const workersai = createWorkersAI({ binding: c.env.AI });
    const model = workersai("@cf/meta/llama-3-8b-instruct");

    // 1. Get Command from AI
    const { object: parsedAi } = await generateObject({
      model,
      schema: z.object({
        command: z.object({
          type: z.enum(["FAIL_LEADER", "FAIL_NODE", "RECOVER_NODE", "SET_KEY", "NO_OP"]),
          nodeId: z.number().optional(),
          key: z.string().optional(),
          value: z.string().optional(),
        }),
      }),
      system: `You are a Raft Consensus Algorithm simulator assistant. Interpret user commands into structured JSON for the next action in the Raft cluster to be performed.

      Commands:
      - FAIL_LEADER: "fail leader", "kill leader"
      - FAIL_NODE: "fail node 2" (requires nodeId)
      - RECOVER_NODE: "recover node 2" (requires nodeId)
      - SET_KEY: "set x to 10" (requires key, value, or only key to unset value)
      - NO_OP: General chat or invalid commands.
      `,
      prompt: prompt,
    });

    const id = c.env.RAFT_CLUSTER.idFromString(sessionId);
    const stub = c.env.RAFT_CLUSTER.get(id);

    // 2. Get Current State
    const oldStateRes = await stub.fetch("https://dummy/getState");
    const oldState = (await oldStateRes.json()) as RaftClusterState;

    // 3. Execute Command
    const executeRes = await stub.fetch("https://dummy/execute", {
      method: "POST",
      body: JSON.stringify({ command: parsedAi.command }),
      headers: { "Content-Type": "application/json" },
    });
    const newState = (await executeRes.json()) as RaftClusterState;

    // 4. Explain with AI (Streaming)
    const filterState = (s: RaftClusterState) => ({
      nodes: s.nodes,
      keyValueStore: s.keyValueStore,
    });

    const lastMessages = oldState.chatHistory.slice(-5);

    const result = streamText({
      model,
      system: `You are a Raft Consensus expert. Explain what happened based on the state change.
      Command Executed: ${JSON.stringify(parsedAi.command)}
      Old State: ${JSON.stringify(filterState(oldState))}
      New State: ${JSON.stringify(filterState(newState))}
      LastError: ${newState.lastError || "none"}

      Explain the state change and answer the user.`,
      messages: [
        ...lastMessages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: prompt },
      ],
      onFinish: async ({ text }) => {
        // 5. Add History (Async)
        await stub.fetch("https://dummy/addHistory", {
          method: "POST",
          body: JSON.stringify({ prompt, explanation: text }),
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    // Return the stream response
    return result.toTextStreamResponse({
      headers: {
        "X-Raft-State": JSON.stringify(newState),
      }
    });
  }
}
