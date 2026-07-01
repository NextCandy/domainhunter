// Admin: list rdap jobs + enrich jobs for the history page.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function ensureAdmin() {
  const [{ getRequest }, { hasRole, verifyToken }] = await Promise.all([
    import("@tanstack/react-start/server"),
    import("@/lib/auth.server"),
  ]);
  const authHeader = getRequest()?.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("未登录或登录已过期");
  const claims = verifyToken(authHeader.replace("Bearer ", "").trim());
  if (!claims.sub || !(await hasRole(claims.sub, "admin"))) {
    throw new Error("仅管理员可访问该操作");
  }
}

async function getDb() {
  const { pgShim } = await import("@/lib/pg-shim.server");
  return pgShim;
}

const schema = z.object({
  kind: z.enum(["jobs", "enrich_jobs"]),
  status: z.string().optional(),
  fromIso: z.string().nullable().optional(),
  toIso: z.string().nullable().optional(),
});

export const listAdminHistoryFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => schema.parse(d))
  .handler(async ({ data }) => {
    await ensureAdmin();
    const db = await getDb();
    let q = db.from(data.kind).select("*").order("created_at", { ascending: false }).limit(200);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.fromIso) q = q.gte("created_at", data.fromIso);
    if (data.toIso) q = q.lte("created_at", data.toIso);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
