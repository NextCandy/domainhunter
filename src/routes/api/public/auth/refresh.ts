import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  refreshToken: z.string().min(20),
});

export const Route = createFileRoute("/api/public/auth/refresh")({
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
        if (!parsed.success) return Response.json({ error: "刷新令牌格式错误" }, { status: 400 });

        try {
          const { verifyRefreshToken, findUserById, signToken, signRefreshToken } = await import("@/lib/auth.server");
          const claims = verifyRefreshToken(parsed.data.refreshToken);
          const user = await findUserById(claims.sub);
          if (!user) return Response.json({ error: "用户不存在或已失效" }, { status: 401 });

          const currentVersion = Number((user as any).refresh_token_version ?? 0);
          if (Number(claims.ver ?? -1) !== currentVersion) {
            return Response.json({ error: "登录状态已失效，请重新登录" }, { status: 401 });
          }

          const token = signToken({ sub: user.id, email: user.email, ver: currentVersion });
          const refreshToken = signRefreshToken({ sub: user.id, email: user.email, ver: currentVersion });
          return Response.json({ user: { id: user.id, email: user.email }, token, refreshToken });
        } catch {
          return Response.json({ error: "登录状态已过期，请重新登录" }, { status: 401 });
        }
      },
    },
  },
});
