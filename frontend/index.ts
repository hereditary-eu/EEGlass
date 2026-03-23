import { serve } from "bun";
import index from "./index.html";
import clustersInFocusIndex from "./clustersinfocus.html";
import neurodegenVisIndex from "./neurodegenvis.html";

const enableHmr = process.env.BUN_HMR === "1";

const server = serve({
  routes: {
    "/tool-apps/clusters-in-focus": clustersInFocusIndex,
    "/tool-apps/neurodegen-vis": neurodegenVisIndex,

    "/tool-assets/neurodegenvis/:filename": async (req) => {
      const filename = req.params.filename;

      if (!filename || filename.includes("/") || filename.includes("\\")) {
        return new Response("Invalid asset path", { status: 400 });
      }

      const file = Bun.file(new URL(`./features/neurodegenvis/data/${filename}`, import.meta.url));

      if (!(await file.exists())) {
        return new Response("Not found", { status: 404 });
      }

      return new Response(file);
    },

    // Serve index.html for all unmatched routes.
    "/*": index,

    "/api/hello": {
      async GET(req) {
        return Response.json({
          message: "Hello, world!",
          method: "GET",
        });
      },
      async PUT(req) {
        return Response.json({
          message: "Hello, world!",
          method: "PUT",
        });
      },
    },

    "/api/hello/:name": async (req) => {
      const name = req.params.name;
      return Response.json({
        message: `Hello, ${name}!`,
      });
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    // Bun hot mode currently breaks some CSS-module imports in the merged CiF frontend.
    hmr: enableHmr,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
