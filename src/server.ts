import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { startWatchlistScheduler } from "./lib/watchlist-refresh.server";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    startWatchlistScheduler();
    const startedAt = Date.now();
    let userId: string | undefined;
    try {
      const auth = request.headers.get("authorization");
      if (auth?.startsWith("Bearer ")) {
        try {
          const { verifyToken } = await import("./lib/auth.server");
          userId = verifyToken(auth.replace("Bearer ", "").trim()).sub;
        } catch {
          // Request logging treats invalid or expired tokens as anonymous traffic.
        }
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      logRequest(request, normalized.status, Date.now() - startedAt, userId);
      return normalized;
    } catch (error) {
      console.error(error);
      logRequest(request, 500, Date.now() - startedAt, userId);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};

function logRequest(request: Request, status: number, durationMs: number, userId?: string) {
  const url = new URL(request.url);
  const isApi = url.pathname.startsWith("/api/") || url.pathname.includes("/_server");
  if (!isApi) return;
  const detail = process.env.NODE_ENV === "development" ? ` 用户=${userId ?? "匿名"}` : "";
  console.info(
    `[请求日志] ${request.method} ${url.pathname} 状态=${status} 耗时=${durationMs}ms${detail}`,
  );
}
