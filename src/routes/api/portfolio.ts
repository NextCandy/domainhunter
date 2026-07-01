import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getMockStore, nextMockId, toMockDomain } from "@/lib/mock-api-store";

const PortfolioSchema = z.object({
  domain: z.string().min(3).max(253),
  registrar: z.string().max(80).nullable().optional(),
  expiry_date: z.string().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).default([]),
});

export const Route = createFileRoute("/api/portfolio")({
  server: {
    handlers: {
      GET: async () => {
        const store = getMockStore();
        return Response.json({
          ok: true,
          mode: "mock",
          TODO: "Replace with authenticated portfolio database service.",
          rows: store.portfolio.map((item) => ({
            ...item,
            valuation: toMockDomain(item.domain).estimatedRange,
          })),
        });
      },
      POST: async ({ request }) => {
        try {
          const body = PortfolioSchema.parse(await request.json());
          const store = getMockStore();
          const domain = body.domain.trim().toLowerCase();
          const existing = store.portfolio.find((item) => item.domain === domain);
          if (existing) {
            Object.assign(existing, { ...body, domain });
            return Response.json({ ok: true, mode: "mock", action: "updated", item: existing });
          }
          const item = {
            id: nextMockId(),
            ...body,
            domain,
            registrar: body.registrar ?? null,
            expiry_date: body.expiry_date ?? null,
            note: body.note ?? null,
            created_at: new Date().toISOString(),
          };
          store.portfolio.unshift(item);
          return Response.json({ ok: true, mode: "mock", action: "added", item });
        } catch (error: unknown) {
          return Response.json(
            { ok: false, error: error instanceof Error ? error.message : "Invalid request" },
            { status: 400 },
          );
        }
      },
      DELETE: async ({ request }) => {
        const url = new URL(request.url);
        const id = Number(url.searchParams.get("id"));
        const domain = url.searchParams.get("domain")?.trim().toLowerCase();
        const store = getMockStore();
        const before = store.portfolio.length;
        store.portfolio = store.portfolio.filter(
          (item) => item.id !== id && item.domain !== domain,
        );
        return Response.json({ ok: true, mode: "mock", removed: before - store.portfolio.length });
      },
    },
  },
});
