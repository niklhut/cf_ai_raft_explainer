// import { fromHono } from "chanfana";
// import { Hono } from "hono";
// import { TaskCreate } from "./endpoints/taskCreate";
// import { TaskDelete } from "./endpoints/taskDelete";
// import { TaskFetch } from "./endpoints/taskFetch";
// import { TaskList } from "./endpoints/taskList";

// // Start a Hono app
// const app = new Hono<{ Bindings: Env }>();

// // Setup OpenAPI registry
// const openapi = fromHono(app, {
// 	docs_url: "/",
// });

// // Register OpenAPI endpoints
// openapi.get("/api/tasks", TaskList);
// openapi.post("/api/tasks", TaskCreate);
// openapi.get("/api/tasks/:taskSlug", TaskFetch);
// openapi.delete("/api/tasks/:taskSlug", TaskDelete);

// // You may also register routes for non OpenAPI directly on Hono
// // app.get('/test', (c) => c.text('Hono!'))

// // Export the Hono app
// export default app;

import { RaftCluster } from "./raft-cluster";

export interface Env {
  RAFT_CLUSTER: DurableObjectNamespace;
  AI: any;
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/chat/new") {
      const id = env.RAFT_CLUSTER.newUniqueId();
      return new Response(JSON.stringify({ sessionId: id.toString() }));
    }

    if (url.pathname.startsWith("/api/chat/")) {
      const id = url.pathname.split("/")[3];
      const stub = env.RAFT_CLUSTER.get(env.RAFT_CLUSTER.idFromString(id));
      return stub.fetch(`https://dummy/chat`, {
        method: "POST",
        body: await request.text(),
      });
    }

    if (url.pathname.startsWith("/api/state/")) {
      const id = url.pathname.split("/")[3];
      const stub = env.RAFT_CLUSTER.get(env.RAFT_CLUSTER.idFromString(id));
      return stub.fetch("https://dummy/getState");
    }

    return new Response("Not found", { status: 404 });
  }
};

export { RaftCluster };