import { useEffect, useState } from "react";

const TOKEN_KEY = "dh.auth.token";
const REFRESH_TOKEN_KEY = "dh.auth.refreshToken";
const USER_KEY = "dh.auth.user";

type User = { id: string; email: string | null };

export type AuthState = {
  loading: boolean;
  userId: string | null;
  email: string | null;
  isAdmin: boolean;
};

function getToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

function getRefreshToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
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

function storeSession(token: string, user: User, refreshToken?: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
  if (refreshToken) window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new CustomEvent("dh-auth-change"));
}

function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new CustomEvent("dh-auth-change"));
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  const res = await fetch("/api/public/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    clearSession();
    return false;
  }
  const data = await res.json();
  if (!data?.token || !data?.user) return false;
  storeSession(data.token, data.user, data.refreshToken);
  return true;
}

async function api(path: string, init: RequestInit = {}, retry = true) {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  if (!res.ok) {
    const canRefresh =
      res.status === 401 &&
      retry &&
      !path.includes("/auth/refresh") &&
      !path.includes("/auth/login") &&
      !path.includes("/auth/signup");
    if (canRefresh && (await refreshAccessToken())) return api(path, init, false);
    throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
  }
  return data;
}

export async function getCurrentUser(): Promise<User | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const data = await api("/api/public/auth/me");
    if (data?.user) {
      window.localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      return data.user;
    }
  } catch {
    clearSession();
  }
  return null;
}

export async function login(email: string, password: string) {
  const data = await api("/api/public/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  storeSession(data.token, data.user, data.refreshToken);
  return data.user as User;
}

export async function register(email: string, password: string, displayName?: string) {
  const data = await api("/api/public/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password, displayName }),
  });
  storeSession(data.token, data.user, data.refreshToken);
  return data.user as User;
}

export async function refreshToken() {
  await refreshAccessToken();
  return getCurrentUser();
}

export async function signOut() {
  clearSession();
}

async function getServerAdmin(userId: string | null) {
  if (!userId) return false;
  try {
    const data = await api("/api/public/rpc/has_role", {
      method: "POST",
      body: JSON.stringify({ _user_id: userId, _role: "admin" }),
    });
    return !!data?.data;
  } catch {
    return false;
  }
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    loading: true,
    userId: null,
    email: null,
    isAdmin: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const cached = getCachedUser();
      const user = (await getCurrentUser()) ?? cached;
      const isAdmin = await getServerAdmin(user?.id ?? null);
      if (!cancelled) {
        setState({
          loading: false,
          userId: user?.id ?? null,
          email: user?.email ?? null,
          isAdmin,
        });
      }
    }

    void load();
    window.addEventListener("dh-auth-change", load);
    return () => {
      cancelled = true;
      window.removeEventListener("dh-auth-change", load);
    };
  }, []);

  return state;
}
