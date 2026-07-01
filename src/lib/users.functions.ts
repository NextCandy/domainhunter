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
  return { userId: claims.sub };
}

async function queryDb(sql: string, params?: unknown[]) {
  const { query } = await import("@/lib/db.server");
  return query(sql, params);
}

async function withDbClient<T>(fn: Parameters<typeof import("@/lib/db.server").withClient<T>>[0]) {
  const { withClient } = await import("@/lib/db.server");
  return withClient(fn);
}

export const listUsersFn = createServerFn({ method: "POST" }).handler(async () => {
  await ensureAdmin();
  const { rows } = await queryDb(`
      SELECT
        u.id,
        u.email,
        u.display_name,
        u.created_at,
        u.last_login_at AS last_sign_in_at,
        COALESCE(bool_or(r.role = 'admin'), false) AS is_admin
      FROM public.app_users u
      LEFT JOIN public.user_roles r ON r.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT 200
    `);
  return rows;
});

const userIdSchema = z.object({ userId: z.string().uuid() });

export const grantAdminFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => userIdSchema.parse(d))
  .handler(async ({ data }) => {
    await ensureAdmin();
    await queryDb(
      `INSERT INTO public.user_roles (user_id, role)
       VALUES ($1, 'admin')
       ON CONFLICT (user_id, role) DO NOTHING`,
      [data.userId],
    );
    return { ok: true };
  });

export const revokeAdminFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => userIdSchema.parse(d))
  .handler(async ({ data }) => {
    const context = await ensureAdmin();
    if (data.userId === context.userId) throw new Error("不能撤销自己的管理员权限");
    await queryDb(`DELETE FROM public.user_roles WHERE user_id = $1 AND role = 'admin'`, [
      data.userId,
    ]);
    return { ok: true };
  });

export const resetUserPasswordFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        password: z.string().min(6, "密码至少 6 位").max(200, "密码过长"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await ensureAdmin();
    const { hashPassword } = await import("@/lib/auth.server");
    const passwordHash = await hashPassword(data.password);
    await withDbClient(async (client) => {
      const result = await client.query(
        `UPDATE public.app_users
         SET password_hash = $2,
             refresh_token_version = COALESCE(refresh_token_version, 0) + 1
         WHERE id = $1`,
        [data.userId, passwordHash],
      );
      if (result.rowCount === 0) throw new Error("用户不存在");
    });
    return { ok: true };
  });
