// Public cron endpoint: refreshes registrar prices from configured APIs.
// Triggered by pg_cron via net.http_post.
import { createFileRoute } from "@tanstack/react-router";
import { syncAllRegistrarPricesInternal } from "@/lib/pricing.functions";

export const Route = createFileRoute("/api/public/hooks/sync-prices")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Require the project anon/publishable key in `apikey` header.
        const apikey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!apikey || !expected || apikey !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const results = await syncAllRegistrarPricesInternal();
          return Response.json({ ok: true, syncedAt: new Date().toISOString(), results });
        } catch (e: any) {
          return Response.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
        }
      },
    },
  },
});
