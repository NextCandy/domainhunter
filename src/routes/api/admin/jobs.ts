import { createFileRoute } from "@tanstack/react-router";
import { getMockStore } from "@/lib/mock-api-store";

export const Route = createFileRoute("/api/admin/jobs")({
  server: {
    handlers: {
      GET: async () => {
        const store = getMockStore();
        return Response.json({
          ok: true,
          mode: "mock",
          TODO: "Replace with admin-only jobs/enrich_jobs queue query and audit log joins.",
          rows: store.jobs,
          queue: {
            pending: store.jobs.filter((job) => job.status === "pending").length,
            running: store.jobs.filter((job) => job.status === "running").length,
            failed: store.jobs.filter((job) => job.status === "failed").length,
          },
        });
      },
    },
  },
});
