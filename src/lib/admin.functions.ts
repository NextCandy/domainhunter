// Admin: list rdap jobs + enrich jobs for the history page.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guards";
import { pgShim } from "@/lib/pg-shim.server";

const schema = z.object({
  kind: z.enum(["jobs", "enrich_jobs"]),
  status: z.string().optional(),
  fromIso: z.string().nullable().optional(),
  toIso: z.string().nullable().optional(),
});

export const listAdminHistoryFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data }) => {
    let q = pgShim.from(data.kind).select("*").order("created_at", { ascending: false }).limit(200);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.fromIso) q = q.gte("created_at", data.fromIso);
    if (data.toIso) q = q.lte("created_at", data.toIso);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
