// Auth middleware (requireAuth / requireAdmin) for server functions.
//
// IMPORTANT — keep this module free of *top-level* Node-only imports
// (jsonwebtoken, bcryptjs, pg, ...). These guards are referenced at module
// top-level via `.middleware([...])` inside client-reachable *.functions.ts
// files, so anything eagerly imported here is pulled into the CLIENT bundle.
// auth.server.ts statically imports `jsonwebtoken` (→ safe-buffer), which throws
// "Cannot read properties of undefined (reading 'from')" during browser module
// init and crashes the whole page. All Node deps are therefore loaded *lazily*
// inside the `.server()` body, which only ever runs on the server.
import { createMiddleware } from "@tanstack/react-start";
import type { AuthClaims, AuthContext } from "./auth.server";

async function authenticate(): Promise<AuthClaims> {
  const [{ getRequest }, { verifyToken }] = await Promise.all([
    import("@tanstack/react-start/server"),
    import("./auth.server"),
  ]);
  const request = getRequest();
  const authHeader = request?.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("未登录或登录已过期");
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) throw new Error("未登录或登录已过期");
  let claims: AuthClaims;
  try {
    claims = verifyToken(token);
  } catch {
    throw new Error("未登录或登录已过期");
  }
  if (!claims.sub) throw new Error("未登录或登录已过期");
  return claims;
}

export const requireAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const claims = await authenticate();
  return next({ context: { userId: claims.sub, claims } satisfies AuthContext });
});

export const requireAdmin = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const claims = await authenticate();
  const { hasRole } = await import("./auth.server");
  if (!(await hasRole(claims.sub, "admin"))) throw new Error("仅管理员可访问该操作");
  return next({ context: { userId: claims.sub, claims } satisfies AuthContext });
});
