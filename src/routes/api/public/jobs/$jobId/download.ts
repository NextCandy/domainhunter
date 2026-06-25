// Public download endpoint for job result files.
// /api/public/jobs/<uuid>/download?kind=available|all|errors

import { createFileRoute } from "@tanstack/react-router";

const VALID_KINDS = ["available", "all", "errors"] as const;
type Kind = (typeof VALID_KINDS)[number];

export const Route = createFileRoute("/api/public/jobs/$jobId/download")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const jobId = params.jobId;
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
          return new Response("Bad job id", { status: 400 });
        }
        const url = new URL(request.url);
        const kind = (url.searchParams.get("kind") || "available") as Kind;
        if (!VALID_KINDS.includes(kind)) {
          return new Response("Bad kind", { status: 400 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: job } = await supabaseAdmin
          .from("jobs")
          .select("name")
          .eq("id", jobId)
          .maybeSingle();
        if (!job) return new Response("Not found", { status: 404 });

        let body = "";
        let filename = "";
        let contentType = "text/plain; charset=utf-8";

        if (kind === "available") {
          const { data } = await supabaseAdmin
            .from("job_items")
            .select("domain")
            .eq("job_id", jobId)
            .eq("status", "available")
            .order("domain");
          body = (data || []).map((r: any) => r.domain).join("\n") + "\n";
          filename = "available.txt";
        } else if (kind === "errors") {
          const { data } = await supabaseAdmin
            .from("job_items")
            .select("domain, error")
            .eq("job_id", jobId)
            .eq("status", "error")
            .order("domain");
          body =
            (data || []).map((r: any) => `${r.domain}\t${r.error || ""}`).join("\n") + "\n";
          filename = "errors.txt";
        } else {
          // all
          contentType = "text/tab-separated-values; charset=utf-8";
          filename = "all_results.tsv";
          const lines = [
            "domain\tstatus\tregistrar\tcreated\texpires\tnameservers\tsource\terror",
          ];
          const PAGE = 1000;
          let from = 0;
          while (true) {
            const { data, error } = await supabaseAdmin
              .from("job_items")
              .select("domain, status, info, error")
              .eq("job_id", jobId)
              .order("domain")
              .range(from, from + PAGE - 1);
            if (error || !data || data.length === 0) break;
            for (const r of data as any[]) {
              const info = r.info || {};
              lines.push(
                [
                  r.domain,
                  r.status,
                  info.registrar || "",
                  info.createdDate || "",
                  info.expiresDate || "",
                  (info.nameservers || []).join(";"),
                  info.source || "",
                  r.error || "",
                ]
                  .map((x: string) => String(x).replace(/\t|\n/g, " "))
                  .join("\t"),
              );
            }
            if (data.length < PAGE) break;
            from += PAGE;
          }
          body = lines.join("\n") + "\n";
        }

        return new Response(body, {
          headers: {
            "Content-Type": contentType,
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
