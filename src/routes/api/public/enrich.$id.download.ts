// Public download endpoint for enriched results. No auth: returns aggregated
// non-PII domain data. Caller passes ?kind=enriched_csv|enriched_json|available_enriched_csv.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/enrich/$id/download")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const id = params.id;
        const url = new URL(request.url);
        const kind = url.searchParams.get("kind") ?? "enriched_csv";

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: job } = await supabaseAdmin.from("enrich_jobs").select("id, name, kinds").eq("id", id).maybeSingle();
        if (!job) return new Response("Not found", { status: 404 });

        // Pull all items (capped)
        const { data: items } = await supabaseAdmin
          .from("enrich_items")
          .select("domain, kind, status, result")
          .eq("enrich_job_id", id)
          .limit(200_000);

        // Pivot: one row per domain with columns per kind
        const map = new Map<string, any>();
        for (const it of (items ?? []) as any[]) {
          const row = map.get(it.domain) ?? { domain: it.domain };
          row[it.kind] = it.result ?? null;
          row[`${it.kind}_status`] = it.status;
          map.set(it.domain, row);
        }
        let rows = Array.from(map.values());

        // Joined with job_items registration data when available
        const { data: srcItems } = await supabaseAdmin
          .from("job_items")
          .select("domain, status, info")
          .eq("job_id", (job as any).source_job_id ?? "00000000-0000-0000-0000-000000000000")
          .limit(200_000);
        const regMap = new Map<string, any>();
        for (const s of (srcItems ?? []) as any[]) regMap.set(s.domain, s);
        for (const r of rows) {
          const reg = regMap.get(r.domain);
          if (reg) {
            r.registration_status = reg.status;
            r.registrar = reg.info?.registrar ?? null;
            r.expiry = reg.info?.expiry ?? null;
          }
        }

        if (kind === "available_enriched_csv") {
          rows = rows.filter(r => r.registration_status === "available");
        }

        if (kind === "enriched_json") {
          return new Response(JSON.stringify({ job, rows }, null, 2), {
            headers: {
              "content-type": "application/json; charset=utf-8",
              "content-disposition": `attachment; filename="enriched-${id}.json"`,
            },
          });
        }

        const headers = [
          "domain","registration_status","registrar","expiry",
          "dns_a","dns_ns","dns_mx",
          "archive_year","archive_count",
          "seo_rank","seo_traffic","seo_keywords",
        ];
        const lines = [headers.join(",")];
        for (const r of rows) {
          const dns = r.dns ?? {};
          const arc = r.archive ?? {};
          const seo = r.seo ?? {};
          const cells = [
            r.domain,
            r.registration_status ?? "",
            r.registrar ?? "",
            r.expiry ?? "",
            (dns.a_records ?? []).join("|"),
            (dns.ns_records ?? []).join("|"),
            (dns.mx_records ?? []).join("|"),
            arc.archive_year ?? "",
            arc.archive_count ?? "",
            seo.rank ?? "",
            seo.organic_traffic ?? "",
            seo.organic_keywords ?? "",
          ].map(csvCell);
          lines.push(cells.join(","));
        }
        const fname = kind === "available_enriched_csv" ? `available-enriched-${id}.csv` : `enriched-${id}.csv`;
        return new Response(lines.join("\n"), {
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": `attachment; filename="${fname}"`,
          },
        });
      },
    },
  },
});

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
