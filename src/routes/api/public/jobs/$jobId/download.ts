// Public download endpoint for job result files.
// /api/public/jobs/<uuid>/download?kind=available|all|errors|events|error-report

import { createFileRoute } from "@tanstack/react-router";

const VALID_KINDS = ["available", "all", "errors", "events", "error-report", "csv"] as const;
type Kind = (typeof VALID_KINDS)[number];

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}


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
          return new Response(`Bad kind: ${kind}`, { status: 400 });
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
        } else if (kind === "events") {
          contentType = "text/tab-separated-values; charset=utf-8";
          filename = "audit_log.tsv";
          const lines = ["created_at\tlevel\tevent\tmessage\tmeta"];
          const PAGE = 1000;
          let from = 0;
          while (true) {
            const { data, error } = await supabaseAdmin
              .from("job_events")
              .select("created_at, level, event, message, meta")
              .eq("job_id", jobId)
              .order("created_at", { ascending: true })
              .range(from, from + PAGE - 1);
            if (error || !data || data.length === 0) break;
            for (const r of data as any[]) {
              lines.push(
                [
                  r.created_at,
                  r.level,
                  r.event,
                  r.message || "",
                  r.meta ? JSON.stringify(r.meta) : "",
                ]
                  .map((x) => String(x).replace(/\t|\n|\r/g, " "))
                  .join("\t"),
              );
            }
            if (data.length < PAGE) break;
            from += PAGE;
          }
          body = lines.join("\n") + "\n";
        } else if (kind === "error-report") {
          contentType = "application/json; charset=utf-8";
          filename = "error_report.json";
          const { data: items } = await supabaseAdmin
            .from("job_items")
            .select("domain, error, checked_at")
            .eq("job_id", jobId)
            .eq("status", "error")
            .order("checked_at", { ascending: false })
            .limit(5000);
          const buckets = new Map<string, { count: number; samples: string[] }>();
          for (const r of (items || []) as any[]) {
            const key = (r.error || "unknown").slice(0, 200);
            const b = buckets.get(key) || { count: 0, samples: [] };
            b.count++;
            if (b.samples.length < 10) b.samples.push(r.domain);
            buckets.set(key, b);
          }
          const grouped = [...buckets.entries()]
            .map(([reason, v]) => ({ reason, count: v.count, samples: v.samples }))
            .sort((a, b) => b.count - a.count);
          body = JSON.stringify(
            {
              jobId,
              jobName: (job as any).name,
              totalErrors: items?.length || 0,
              groupedByReason: grouped,
              items: items || [],
            },
            null,
            2,
          );
        } else if (kind === "csv") {
          contentType = "text/csv; charset=utf-8";
          filename = "results.csv";
          const lines = ["domain,tld,status,source,registrar,expires,error"];
          const PAGE = 1000;
          let from = 0;
          while (true) {
            const { data, error } = await supabaseAdmin
              .from("job_items")
              .select("domain, tld, status, info, error")
              .eq("job_id", jobId)
              .order("domain")
              .range(from, from + PAGE - 1);
            if (error || !data || data.length === 0) break;
            for (const r of data as any[]) {
              const info = r.info || {};
              lines.push([
                r.domain, r.tld || r.domain.split(".").slice(1).join("."), r.status,
                info.source || "", info.registrar || "", info.expiresDate || "", r.error || "",
              ].map(csvEscape).join(","));
            }
            if (data.length < PAGE) break;
            from += PAGE;
          }
          body = lines.join("\n") + "\n";
        } else {
          // all (TSV)
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
