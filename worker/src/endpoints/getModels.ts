import { OpenAPIRoute } from "chanfana"
import { z } from "zod"
import type { AppContext } from "../types"

export class GetModels extends OpenAPIRoute {
  schema = {
    tags: ["Chat"],
    summary: "Get available chat models",
    responses: {
      "200": {
        description: "Returns a list of available models",
        content: {
          "application/json": {
            schema: z.object({
              models: z.array(
                z.object({
                  id: z.string(),
                  name: z.string(),
                }),
              ),
            }),
          },
        },
      },
    },
  }

  async handle(c: AppContext) {
    const models = [
      {
        id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        name: "Llama 3.3 70B",
      },
    ]

    if (c.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      models.push({ id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" })
      models.push({
        id: "gemini-2.0-flash-lite-preview-02-05",
        name: "Gemini 2.0 Flash Lite",
      })
    }

    return c.json({ models })
  }
}
