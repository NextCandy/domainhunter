// Self-hosted shim: replaces the Supabase browser client with a thin auth
// surface backed by `/api/public/auth/*` endpoints. Preserves the methods
// used in the codebase: auth.{getUser,getSession,signOut,signUp,
// signInWithPassword,onAuthStateChange}, and rpc("has_role", ...).
//
// For backend data the browser does NOT talk to Postgres directly; all
// queries flow through serverFns. So `from()` here just throws if used.

const TOKEN_KEY = "dh.auth.token";
const USER_KEY = "dh.auth.user";

type User = { id: string; email: string | null };
type Session = { access_token: string; user: User } | null;
type AuthEvent = "SIGNED_IN" | "SIGNED_OUT" | "USER_UPDATED" | "INITIAL_SESSION" | "TOKEN_REFRESHED";

const listeners = new Set<(event: AuthEvent, session: Session) => void>();

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}
function getCachedUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function storeSession(token: string, user: User) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}
function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}
function emit(event: AuthEvent, session: Session) {
  for (const fn of listeners) {
    try { fn(event, session); } catch { /* ignore */ }
  }
}

async function api(path: string, body?: unknown, opts: { auth?: boolean } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.auth) {
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  if (!res.ok) {
    const msg = data?.error || data?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export const supabase = {
  auth: {
    async getSession() {
      const token = getToken();
      const user = getCachedUser();
      if (!token || !user) return { data: { session: null }, error: null };
      return { data: { session: { access_token: token, user } as NonNullable<Session> }, error: null };
    },
    async getUser() {
      const token = getToken();
      if (!token) return { data: { user: null }, error: null };
      try {
        const r = await api("/api/public/auth/me", undefined, { auth: true });
        if (r?.user) storeSession(token, r.user);
        return { data: { user: r?.user ?? null }, error: null };
      } catch (e: any) {
        clearSession();
        return { data: { user: null }, error: { message: String(e?.message ?? e) } };
      }
    },
    async signUp(payload: { email: string; password: string; options?: unknown }) {
      try {
        const r = await api("/api/public/auth/signup", { email: payload.email, password: payload.password });
        storeSession(r.token, r.user);
        emit("SIGNED_IN", { access_token: r.token, user: r.user });
        return { data: { user: r.user, session: { access_token: r.token, user: r.user } }, error: null };
      } catch (e: any) {
        return { data: { user: null, session: null }, error: { message: String(e?.message ?? e) } };
      }
    },
    async signInWithPassword(payload: { email: string; password: string }) {
      try {
        const r = await api("/api/public/auth/login", payload);
        storeSession(r.token, r.user);
        emit("SIGNED_IN", { access_token: r.token, user: r.user });
        return { data: { user: r.user, session: { access_token: r.token, user: r.user } }, error: null };
      } catch (e: any) {
        return { data: { user: null, session: null }, error: { message: String(e?.message ?? e) } };
      }
    },
    async signOut() {
      clearSession();
      emit("SIGNED_OUT", null);
      return { error: null };
    },
    onAuthStateChange(cb: (event: AuthEvent, session: Session) => void) {
      listeners.add(cb);
      // initial event
      const token = getToken();
      const user = getCachedUser();
      setTimeout(() => cb("INITIAL_SESSION", token && user ? { access_token: token, user } : null), 0);
      return {
        data: {
          subscription: {
            unsubscribe: () => listeners.delete(cb),
          },
        },
      };
    },
    async getClaims(_token: string) {
      // browser side just returns cached
      const user = getCachedUser();
      if (!user) return { data: null, error: { message: "no claims" } };
      return { data: { claims: { sub: user.id, email: user.email } }, error: null };
    },
  },
  async rpc(name: string, params: Record<string, unknown> = {}) {
    try {
      const r = await api(`/api/public/rpc/${encodeURIComponent(name)}`, params, { auth: true });
      return { data: r?.data ?? null, error: null };
    } catch (e: any) {
      return { data: null, error: { message: String(e?.message ?? e) } };
    }
  },
  from(_table: string): never {
    throw new Error(
      "supabase.from() is not available in the browser. Move this query into a serverFn.",
    );
  },
};
