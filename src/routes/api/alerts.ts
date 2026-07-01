import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getMockStore, nextMockId } from "@/lib/mock-api-store";

const AlertSchema = z.object({
  domain: z.string().min(3).max(253),
  channel: z.enum(["email", "telegram", "discord", "webhook"]),
  event: z.string().min(1).max(80),
  enabled: z.boolean().default(true),
});

export const Route = createFileRoute("/api/alerts")({
  server: {
    handlers: {
      GET: async () => {
        const store = getMockStore();
        return Response.json({
          ok: true,
          mode: "mock",
          TODO: "Replace with authenticated alert channel settings and delivery logs.",
          rows: store.alerts,
        });
      },
      POST: async ({ request }) => {
        try {
          const body = AlertSchema.parse(await request.json());
          const store = getMockStore();
          const item = {
            id: nextMockId(),
            ...body,
            domain: body.domain.trim().toLowerCase(),
            created_at: new Date().toISOString(),
          };
          store.alerts.unshift(item);
          return Response.json({ ok: true, mode: "mock", item });
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
