import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { enrichTerminalRow } from "@/lib/domain-terminal";

const AnalyzeSchema = z.object({
  domain: z.string().min(3).max(253),
});

export const Route = createFileRoute("/api/ai/analyze")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = AnalyzeSchema.parse(await request.json());
          const row = enrichTerminalRow({ domain: body.domain, source: "mock" });
          return Response.json({
            ok: true,
            mode: "mock",
            TODO: "Call the configured backend LLM provider using server-side env vars only; never expose API keys to the client.",
            domain: row.domain,
            summary: row.aiSummary,
            similar: [`get${row.name}.com`, `${row.name}hub.io`, `${row.name}labs.co`],
            analysis: {
              domain: row.domain,
              summary: row.aiSummary,
              scoreParts: row.scoreParts,
              recommendation: row.aiRecommended
                ? "推荐进入观察并执行 Archive/SEO enrich。"
                : "建议先复核历史风险和竞品占用。",
            },
          });
        } catch (error: unknown) {
          return Response.json({
            ok: true,
            mode: "fallback",
            domain: "unknown",
            summary: "AI 洞察暂不可用，已使用本地 fallback。请稍后重试或检查后端 LLM 配置。",
            similar: [],
            analysis: {
              summary: "AI 洞察暂不可用，已使用本地 fallback。请稍后重试或检查后端 LLM 配置。",
            },
            error: error instanceof Error ? error.message : "Analyze failed",
          });
        }
      },
    },
  },
});
