import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { hashPassword } from "@/lib/auth.server";
import { requireAdmin } from "@/lib/auth-guards";
import { query, withClient } from "@/lib/db.server";

export const listUsersFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { rows } = await query(`
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
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => userIdSchema.parse(d))
  .handler(async ({ data }) => {
    await query(
      `INSERT INTO public.user_roles (user_id, role)
       VALUES ($1, 'admin')
       ON CONFLICT (user_id, role) DO NOTHING`,
      [data.userId],
    );
    return { ok: true };
  });

export const revokeAdminFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => userIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    if (data.userId === context.userId) throw new Error("不能撤销自己的管理员权限");
    await query(`DELETE FROM public.user_roles WHERE user_id = $1 AND role = 'admin'`, [data.userId]);
    return { ok: true };
  });

export const resetUserPasswordFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z.object({
      userId: z.string().uuid(),
      password: z.string().min(6, "密码至少 6 位").max(200, "密码过长"),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const passwordHash = await hashPassword(data.password);
    await withClient(async (client) => {
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
