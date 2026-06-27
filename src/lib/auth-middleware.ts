import { createMiddleware } from "@tanstack/react-start";

const TOKEN_KEY = "dh.auth.token";

export const attachAuthHeader = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const token = typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_KEY);
  return next({
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
});
