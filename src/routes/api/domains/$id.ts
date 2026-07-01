import { createFileRoute } from "@tanstack/react-router";
import { toMockDomain } from "@/lib/mock-api-store";

export const Route = createFileRoute("/api/domains/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const raw = decodeURIComponent(params.id);
        const domain = raw.includes(".") ? raw : `${raw}.com`;
        const detail = toMockDomain(domain);
        return Response.json({
          ok: true,
          mode: "mock",
          TODO: "Replace with domains/domain_metrics/domain_whois/domain_dns joins.",
          domain: detail,
          history: detail.hasArchive
            ? [
                {
                  year: detail.metrics?.archive_year,
                  snapshots: detail.metrics?.archive_count ?? 0,
                  note: "Mock Archive.org history summary",
                },
              ]
            : [],
          metrics: detail.scoreParts,
          ai: {
            summary: detail.aiSummary,
            recommended: detail.aiRecommended,
          },
        });
      },
    },
  },
});
