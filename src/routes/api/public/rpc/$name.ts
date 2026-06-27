// Generic RPC endpoint. Only safe functions are whitelisted; everything else 404s.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/rpc/$name")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = request.headers.get("authorization");
        if (!auth || !auth.startsWith("Bearer ")) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const token = auth.replace("Bearer ", "").trim();
        const { verifyToken } = await import("@/lib/auth.server");
        let claims;
        try { claims = verifyToken(token); }
        catch { return Response.json({ error: "Unauthorized" }, { status: 401 }); }

        let body: any = {};
        try { body = await request.json(); } catch { /* empty body ok */ }

        if (params.name === "has_role") {
          const { hasRole } = await import("@/lib/auth.server");
          const userId = body?._user_id || claims.sub;
          const role = body?._role;
          if (!role) return Response.json({ error: "missing role" }, { status: 400 });
          const ok = await hasRole(String(userId), String(role));
          return Response.json({ data: ok });
        }

        return Response.json({ error: `unknown rpc ${params.name}` }, { status: 404 });
      },
    },
  },
});
