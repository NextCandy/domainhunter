// Server-only helper: throws if the calling user is not admin.
import { hasRole } from "./auth.server";

export async function assertAdmin(_supabase: unknown, userId: string) {
  const ok = await hasRole(userId, "admin");
  if (!ok) throw new Error("仅管理员可访问该操作");
}
