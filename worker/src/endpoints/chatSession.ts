import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../types";

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
  };

  async handle(c: AppContext) {
    const data = await this.getValidatedData<typeof this.schema>()

    if (c.env.RATE_LIMITER) {
      const ip = c.req.header("CF-Connecting-IP") || "unknown";
      const { success } = await c.env.RATE_LIMITER.limit({ key: ip });
      if (!success) {
        return c.text("Rate limit exceeded", 429);
      }
    }

    // Call Workers AI to interpret command
    // const aiResponse = await c.env.AI.run("@cf/meta/llama-3-8b-instruct", {
    //   messages: [
    //     {
    //       role: "system",
    //       content: `You are a Raft Consensus Algorithm simulator assistant. Interpret user commands into structured JSON.
          
    //       Commands:
    //       - FAIL_LEADER: "fail leader", "kill leader"
    //       - FAIL_NODE: "fail node 2" (requires nodeId)
    //       - RECOVER_NODE: "recover node 2" (requires nodeId)
    //       - SET_KEY: "set x to 10" (requires key, value)
    //       - NO_OP: General chat or invalid commands.

    //       Output JSON ONLY:
    //       {
    //         "command": { "type": "FAIL_LEADER" | "FAIL_NODE" | "RECOVER_NODE" | "SET_KEY" | "NO_OP", "nodeId": number, "key": string, "value": string },
    //         "explanation": "Short explanation for the user."
    //       }`,
    //     },
    //     { role: "user", content: data.body.prompt },
    //   ],
    // });

    const aiResponse = {
      response: JSON.stringify({
        command: { type: "SET_KEY", key: "x", value: "10" },
        explanation:
          "This is a placeholder response SET_KEY. In a real implementation, the AI would interpret your command.",
      }),
    }

    let parsedAi;
    try {
      const cleanJson = (aiResponse as any).response
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
      parsedAi = JSON.parse(cleanJson);
    } catch (e) {
      console.error("Failed to parse AI response", e);
      parsedAi = {
        command: { type: "NO_OP" },
        explanation:
          "I couldn't understand that command, but I'm here to help with Raft!",
      };
    }

    const id = c.env.RAFT_CLUSTER.idFromString(data.params.sessionId);
    const stub = c.env.RAFT_CLUSTER.get(id);

    const doResponse = await stub.fetch("https://dummy/chat", {
      method: "POST",
      body: JSON.stringify({
        prompt: data.body.prompt,
        command: parsedAi.command,
        explanation: parsedAi.explanation,
      }),
      headers: { "Content-Type": "application/json" },
    });

    const responseData = await doResponse.json();
    return c.json(responseData);
  }
}
