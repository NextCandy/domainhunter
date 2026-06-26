import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/auth/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = request.headers.get("authorization");
        if (!auth || !auth.startsWith("Bearer ")) {
          return Response.json({ user: null }, { status: 401 });
        }
        const token = auth.replace("Bearer ", "").trim();
        try {
          const { verifyToken, findUserById } = await import("@/lib/auth.server");
          const claims = verifyToken(token);
          const user = await findUserById(claims.sub);
          if (!user) return Response.json({ user: null }, { status: 401 });
          return Response.json({ user: { id: user.id, email: user.email } });
        } catch {
          return Response.json({ user: null }, { status: 401 });
        }
      },
    },
  },
});
