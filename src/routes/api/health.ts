import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const memory = process.memoryUsage();
        try {
          const { query } = await import("@/lib/db.server");
          await query("SELECT 1");
          return Response.json({
            ok: true,
            db: "ok",
            memory: { rss: memory.rss, heapUsed: memory.heapUsed },
            node: process.version,
            uptime: process.uptime(),
            time: new Date().toISOString(),
          });
        } catch {
          return Response.json({
            ok: false,
            db: "error",
            memory: { rss: memory.rss, heapUsed: memory.heapUsed },
            node: process.version,
            uptime: process.uptime(),
            time: new Date().toISOString(),
          }, { status: 503 });
        }
      },
    },
  },
});
