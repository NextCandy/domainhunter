import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const Route = createFileRoute("/api/public/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: "邮箱或密码格式错误" }, { status: 400 });
        }
        try {
          const { findUserByEmail, verifyPassword, signToken } = await import("@/lib/auth.server");
          const { query } = await import("@/lib/db.server");
          const user = await findUserByEmail(parsed.data.email);
          if (!user || !user.password_hash || !(await verifyPassword(parsed.data.password, user.password_hash))) {
            return Response.json({ error: "邮箱或密码错误" }, { status: 401 });
          }
          await query(`UPDATE public.app_users SET last_login_at = now() WHERE id = $1`, [user.id]);
          const token = signToken({ sub: user.id, email: user.email });
          return Response.json({ user: { id: user.id, email: user.email }, token });
        } catch (e: any) {
          console.error("[auth/login]", e);
          return Response.json({ error: String(e?.message ?? e) }, { status: 500 });
        }
      },
    },
  },
});
