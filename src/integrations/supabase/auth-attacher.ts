// Attaches the local auth bearer (from localStorage) to every serverFn call.
import { createMiddleware } from "@tanstack/react-start";

const TOKEN_KEY = "dh.auth.token";

export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  let token: string | null = null;
  if (typeof window !== "undefined") {
    token = window.localStorage.getItem(TOKEN_KEY);
  }
  return next({
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
});
