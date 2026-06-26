// Self-hosted shim: validates a local JWT (HS256) and exposes the same
// `{ supabase, userId, claims }` context shape as the original Supabase
// middleware so downstream serverFns keep working without changes.
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const request = getRequest();
  if (!request?.headers) throw new Error("Unauthorized: No request headers available");
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Unauthorized: No authorization header provided");
  }
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) throw new Error("Unauthorized: No token provided");

  const { verifyToken } = await import("@/lib/auth.server");
  const { pgShim } = await import("@/lib/pg-shim.server");
  let claims;
  try {
    claims = verifyToken(token);
  } catch {
    throw new Error("Unauthorized: Invalid token");
  }
  if (!claims.sub) throw new Error("Unauthorized: No user ID found in token");

  return next({
    context: {
      supabase: pgShim as any,
      userId: claims.sub,
      claims,
    },
  });
});
