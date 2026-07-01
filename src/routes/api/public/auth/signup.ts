import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  email: z.string().email("邮箱格式不正确"),
  password: z.string().min(6, "密码至少 6 位").max(200, "密码过长"),
  displayName: z.string().max(80).optional(),
});

export const Route = createFileRoute("/api/public/auth/signup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: parsed.error.issues[0]?.message ?? "Invalid input" },
            { status: 400 },
          );
        }
        try {
          const { findUserByEmail, createUser, signToken, signRefreshToken } =
            await import("@/lib/auth.server");
          const existing = await findUserByEmail(parsed.data.email);
          if (existing) {
            return Response.json({ error: "邮箱已注册" }, { status: 409 });
          }
          const user = await createUser(
            parsed.data.email,
            parsed.data.password,
            parsed.data.displayName,
          );
          const token = signToken({ sub: user.id, email: user.email, ver: 0 });
          const refreshToken = signRefreshToken({ sub: user.id, email: user.email, ver: 0 });
          return Response.json({
            user: { id: user.id, email: user.email },
            token,
            refreshToken,
          });
        } catch (e: any) {
          console.error("[auth/signup]", e);
          return Response.json({ error: String(e?.message ?? e) }, { status: 500 });
        }
      },
    },
  },
});
