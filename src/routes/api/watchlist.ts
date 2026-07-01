import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getMockStore, nextMockId, toMockDomain } from "@/lib/mock-api-store";

const UpsertWatchSchema = z.object({
  domain: z.string().min(3).max(253),
  status: z.string().max(30).default("watching"),
  tags: z.array(z.string().max(40)).max(20).default([]),
  note: z.string().max(1000).nullable().optional(),
  notify_before_drop: z.boolean().default(true),
  notify_on_available: z.boolean().default(true),
  notify_on_price_change: z.boolean().default(false),
});

const DeleteSchema = z.object({
  id: z.coerce.number().int().optional(),
  domain: z.string().min(3).max(253).optional(),
});

export const Route = createFileRoute("/api/watchlist")({
  server: {
    handlers: {
      GET: async () => {
        const store = getMockStore();
        return Response.json({
          ok: true,
          mode: "mock",
          TODO: "Replace with authenticated watchlist database service.",
          rows: store.watchlist.map((item) => ({
            ...item,
            domain_detail: toMockDomain(item.domain),
          })),
        });
      },
      POST: async ({ request }) => {
        try {
          const body = UpsertWatchSchema.parse(await request.json());
          const store = getMockStore();
          const domain = body.domain.trim().toLowerCase();
          const existing = store.watchlist.find((item) => item.domain === domain);
          if (existing) {
            Object.assign(existing, { ...body, domain });
            return Response.json({ ok: true, mode: "mock", action: "updated", item: existing });
          }
          const item = {
            id: nextMockId(),
            ...body,
            domain,
            note: body.note ?? null,
            created_at: new Date().toISOString(),
          };
          store.watchlist.unshift(item);
          return Response.json({ ok: true, mode: "mock", action: "added", item });
        } catch (error: unknown) {
          return Response.json(
            { ok: false, error: error instanceof Error ? error.message : "Invalid request" },
            { status: 400 },
          );
        }
      },
      DELETE: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const body = DeleteSchema.parse({
            id: url.searchParams.get("id") ?? undefined,
            domain: url.searchParams.get("domain") ?? undefined,
          });
          const store = getMockStore();
          const before = store.watchlist.length;
          store.watchlist = store.watchlist.filter(
            (item) => item.id !== body.id && item.domain !== body.domain?.trim().toLowerCase(),
          );
          return Response.json({
            ok: true,
            mode: "mock",
            removed: before - store.watchlist.length,
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
