import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getMockStore, toMockDomain } from "@/lib/mock-api-store";

const EnrichSchema = z.object({
  domains: z.array(z.string().min(3).max(253)).min(1).max(500),
  kinds: z.array(z.enum(["dns", "archive", "seo", "whois", "risk"])).default(["dns", "archive"]),
});

export const Route = createFileRoute("/api/domains/enrich")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = EnrichSchema.parse(await request.json());
          const store = getMockStore();
          const job = {
            id: `mock-enrich-${Date.now()}`,
            name: `REST enrich: ${body.domains.length} domains`,
            status: "pending" as const,
            total: body.domains.length * body.kinds.length,
            checked: 0,
            created_at: new Date().toISOString(),
          };
          store.jobs.unshift(job);
          return Response.json({
            ok: true,
            mode: "mock",
            TODO: "Replace with enrich_jobs insertion and worker scheduling.",
            job,
            preview: body.domains.slice(0, 5).map((domain) => toMockDomain(domain)),
          });
        } catch (error: unknown) {
          return Response.json(
            { ok: false, error: error instanceof Error ? error.message : "Invalid request" },
            { status: 400 },
          );
        }
      },
    },
  },
});
