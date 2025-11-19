Initial Prompt on Gemini 3 Pro using Github Copilot in VSCode:

```md
Implement the durable object and API for this project:

## Project: AI-Powered Multi-Session Raft Simulator

### Core Concept
An interactive web application that teaches the Raft consensus algorithm. A user interacts with an AI chatbot (LLM) to issue commands (e.g., "fail the leader," "set key 'x' to 10"). These commands trigger state changes in a simulated Raft cluster. The application is multi-session aware; it persists each user's unique chat history and simulation state, allowing them to return and continue their session.

### Tech Stack
* Frontend: Nuxt.js (in SSG mode) deployed on Cloudflare Pages.
* Backend API: Cloudflare Workers.
* AI/LLM: Workers AI (Llama 3.3) for natural language understanding.
* State & Logic: Durable Objects (one instance per user session).
* Security: Cloudflare Rate Limiting to prevent LLM abuse.

### Component Roles
1.  Cloudflare Worker (API Coordinator):
    * `/api/chat/new`: Creates a new Durable Object ID and returns it.
    * `/api/chat/:sessionId`:
        1.  Validates the request against a Rate Limiter based on the user's IP.
        2.  Parses the `sessionId` from the URL to get the correct DO stub.
        3.  Sends the user's text to Workers AI to parse into a structured JSON command.
        4.  Validates the command from the AI.
        5.  Forwards the user's prompt and the AI's response to the DO's `/chat` endpoint for processing and storage.
        6.  Returns the AI's explanation to the UI.
    * `/api/state/:sessionId`: Gets the correct DO stub and calls its `/getState` method, returning the full state to the UI.

2.  Durable Object (One "RaftCluster" Instance per Session):
    * Acts as the persistent "backend" for a single user's simulation.
    * Internal State (Persisted to Storage):
        * `nodes: NodeState[]`: State of the 5 simulated nodes.
        * `term: number`: The current cluster term.
        * `keyValueStore: Map<string, string>`: The replicated key-value data.
        * `chatHistory: ChatMessage[]`: The user's complete conversation history.
    * API (Methods called by Worker):
        * `/getState`: Returns all internal state (nodes, term, data, history).
        * `/chat` (POST):
            1.  Receives the user's `prompt` and the AI's `command` and `explanation`.
            2.  Executes the simulation logic based on the `command` (e.g., `this.failLeader()`).
            3.  Pushes both the `prompt` and `explanation` to the `chatHistory` array.
            4.  Saves the *entire* state (nodes, history, etc.) to persistent storage.
```

Follow up in same chat:

```md
Thanks. Now refactor the worker API implementation to use the Hono framework for routing. Move all handler functions to the endpoints directory with a separate file for each endpoint. The main worker file should only handle Hono setup, config, and importing the handlers, allowing them to access bindings like env.RATE_LIMITER
```