// Local auth helpers: bcrypt password hashing + JWT session tokens.
// Server-only.
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
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
  iat: number;
  exp: number;
};

export function signToken(payload: { sub: string; email: string | null }, ttlSec = 60 * 60 * 24 * 30) {
  return jwt.sign(payload, SECRET(), { expiresIn: ttlSec });
}

export function verifyToken(token: string): AuthClaims {
  return jwt.verify(token, SECRET()) as AuthClaims;
}

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
  const { rows } = await query<AppUser & { password_hash: string | null }>(
    `SELECT id, email, display_name, created_at, password_hash FROM public.app_users WHERE email = $1 LIMIT 1`,
    [email],
  );
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<AppUser | null> {
  const { rows } = await query<AppUser>(
    `SELECT id, email, display_name, created_at FROM public.app_users WHERE id = $1 LIMIT 1`,
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
