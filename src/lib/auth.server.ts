// Local auth helpers: bcrypt password hashing + JWT session tokens.
// Server-only.
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { query } from "./db.server";

const SECRET = () => {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) {
    throw new Error("JWT_SECRET is missing or too short (>=16 chars required)");
  }
  return s;
};

export type AuthClaims = {
  sub: string;
  email: string | null;
  typ?: "access" | "refresh";
  ver?: number;
  iat: number;
  exp: number;
};

export type AuthContext = {
  userId: string;
  claims: AuthClaims;
};

export function signToken(
  payload: { sub: string; email: string | null; ver?: number },
  ttlSec = 60 * 60,
) {
  return jwt.sign({ ...payload, typ: "access" }, SECRET(), { expiresIn: ttlSec });
}

export function signRefreshToken(
  payload: { sub: string; email: string | null; ver: number },
  ttlSec = 60 * 60 * 24 * 30,
) {
  return jwt.sign({ ...payload, typ: "refresh" }, SECRET(), { expiresIn: ttlSec });
}

export function verifyToken(token: string): AuthClaims {
  return jwt.verify(token, SECRET()) as AuthClaims;
}

export function verifyRefreshToken(token: string): AuthClaims {
  const claims = verifyToken(token);
  if (claims.typ !== "refresh") throw new Error("刷新令牌无效");
  return claims;
}

function getBearerToken() {
  const request = getRequest();
  const authHeader = request?.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("未登录或登录已过期");
  }
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) throw new Error("未登录或登录已过期");
  return token;
}

export const requireAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  let claims: AuthClaims;
  try {
    claims = verifyToken(getBearerToken());
  } catch {
    throw new Error("未登录或登录已过期");
  }
  if (!claims.sub) throw new Error("未登录或登录已过期");
  return next({ context: { userId: claims.sub, claims } satisfies AuthContext });
});

export const requireAdmin = createMiddleware({ type: "function" }).server(async ({ next }) => {
  let claims: AuthClaims;
  try {
    claims = verifyToken(getBearerToken());
  } catch {
    throw new Error("未登录或登录已过期");
  }
  if (!claims.sub) throw new Error("未登录或登录已过期");
  if (!(await hasRole(claims.sub, "admin"))) throw new Error("仅管理员可访问该操作");
  return next({ context: { userId: claims.sub, claims } satisfies AuthContext });
});

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export type AppUser = {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
};

export async function findUserByEmail(email: string): Promise<(AppUser & { password_hash: string | null }) | null> {
  const { rows } = await query<AppUser & { password_hash: string | null; refresh_token_version?: number }>(
    `SELECT id, email, display_name, created_at, password_hash, COALESCE(refresh_token_version, 0) AS refresh_token_version FROM public.app_users WHERE email = $1 LIMIT 1`,
    [email],
  );
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<AppUser | null> {
  const { rows } = await query<AppUser & { refresh_token_version?: number }>(
    `SELECT id, email, display_name, created_at, COALESCE(refresh_token_version, 0) AS refresh_token_version FROM public.app_users WHERE id = $1 LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function createUser(email: string, password: string, displayName?: string): Promise<AppUser> {
  const hash = await hashPassword(password);
  const { rows } = await query<AppUser>(
    `INSERT INTO public.app_users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING id, email, display_name, created_at`,
    [email, hash, displayName ?? null],
  );
  return rows[0];
}

export async function hasRole(userId: string, role: string): Promise<boolean> {
  const { rows } = await query<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = $1 AND role = $2::public.app_role) AS ok`,
    [userId, role],
  );
  return !!rows[0]?.ok;
}
