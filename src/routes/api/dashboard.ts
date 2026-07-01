import { createFileRoute } from "@tanstack/react-router";
import { generateMockDomains } from "@/lib/domain-terminal";

export const Route = createFileRoute("/api/dashboard")({
  server: {
    handlers: {
      GET: async () => {
        const rows = generateMockDomains(5000);
        const high = rows.filter((r) => r.score >= 82);
        const dropTrend = Array.from({ length: 14 }, (_, index) => ({
          date: `D-${13 - index}`,
          count: 260 + ((index * 79) % 520),
          highPotential: 18 + ((index * 17) % 92),
        }));
        const tldDistribution = [".com", ".cn", ".net", ".org", ".do", ".io"].map((tld) => ({
          tld,
          count: rows.filter((row) => row.tld === tld).length,
        }));
        const scoreHistogram = [40, 50, 60, 70, 80, 90].map((bucket) => ({
          bucket: `${bucket}+`,
          count: rows.filter((row) => row.score >= bucket && row.score < bucket + 10).length,
        }));
        const kpis = {
          todayNew: 3842,
          successRate: 12,
          watching: 86,
          portfolioValue: high.slice(0, 24).reduce((sum, r) => sum + r.estimatedValue, 0),
          highPotential: high.length,
          alerts: 7,
        };
        return Response.json({
          ok: true,
          mode: "mock",
          TODO: "Wire to overviewStatsFn/overviewTrendFn or a shared dashboard service with auth.",
          kpi: kpis,
          kpis,
          dropTrend,
          tldDistribution,
          scoreHistogram,
          queue: { pending: 42, running: 8, success: 615, failed: 11 },
          highPotential: high.slice(0, 12),
        });
      },
    },
  },
});
