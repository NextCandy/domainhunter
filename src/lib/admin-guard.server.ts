// Server-only helper: throws if the calling user is not admin.
// Use inside createServerFn handlers AFTER requireSupabaseAuth middleware.

import type { SupabaseClient } from "@supabase/supabase-js";

export async function assertAdmin(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error("权限校验失败：" + error.message);
  if (!data) throw new Error("仅管理员可访问该操作");
}
