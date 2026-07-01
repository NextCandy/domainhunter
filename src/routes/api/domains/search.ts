import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  applyTerminalFilters,
  generateMockDomains,
  pageRows,
  type TerminalFilters,
} from "@/lib/domain-terminal";

const SearchSchema = z.object({
  q: z.string().optional(),
  tlds: z.array(z.string()).optional(),
  statuses: z.array(z.string()).optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  minScore: z.number().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(10).max(200).default(50),
  sortBy: z.string().default("score"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export const Route = createFileRoute("/api/domains/search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const body = SearchSchema.parse({
            q: url.searchParams.get("q") || undefined,
            tlds: splitParam(url.searchParams.get("tlds")),
            statuses: splitParam(url.searchParams.get("statuses")),
            minLength: numberParam(url.searchParams.get("minLength")),
            maxLength: numberParam(url.searchParams.get("maxLength")),
            minScore: numberParam(url.searchParams.get("minScore")),
            page: numberParam(url.searchParams.get("page")) ?? 1,
            pageSize: numberParam(url.searchParams.get("pageSize")) ?? 50,
            sortBy: url.searchParams.get("sortBy") || "score",
            sortDir: url.searchParams.get("sortDir") === "asc" ? "asc" : "desc",
          });
          return mockSearchResponse(body);
        } catch (error: unknown) {
          return Response.json(
            { ok: false, error: error instanceof Error ? error.message : "Invalid request" },
            { status: 400 },
          );
        }
      },
      POST: async ({ request }) => {
        try {
          const body = SearchSchema.parse(await request.json().catch(() => ({})));
          return mockSearchResponse(body);
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

function mockSearchResponse(body: z.infer<typeof SearchSchema>) {
  const filters = body as TerminalFilters;
  const all = applyTerminalFilters(generateMockDomains(5000), filters);
  return Response.json({
    ok: true,
    mode: "mock",
    source: "generated-5000",
    TODO: "Replace with domains/domain_metrics query or shared discoverFn-compatible service when public REST auth is finalized.",
    total: all.length,
    page: body.page,
    pageSize: body.pageSize,
    rows: pageRows(all, body.page, body.pageSize),
  });
}

function splitParam(value: string | null) {
  if (!value) return undefined;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberParam(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
