import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listUsersFn, grantAdminFn, revokeAdminFn } from "@/lib/users.functions";
import { toast } from "sonner";
import { ShieldCheck, ShieldOff } from "lucide-react";

export const Route = createFileRoute("/admin/users")({ component: AdminUsersPage });

function AdminUsersPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => listUsersFn(),
  });

  const grant = useMutation({
    mutationFn: (userId: string) => grantAdminFn({ data: { userId } }),
    onSuccess: () => { toast.success("已授予管理员"); qc.invalidateQueries({ queryKey: ["admin-users"] }); },
    onError: (e: any) => toast.error(e?.message ?? "操作失败"),
  });
  const revoke = useMutation({
    mutationFn: (userId: string) => revokeAdminFn({ data: { userId } }),
    onSuccess: () => { toast.success("已撤销管理员"); qc.invalidateQueries({ queryKey: ["admin-users"] }); },
    onError: (e: any) => toast.error(e?.message ?? "操作失败"),
  });

  return (
    <div className="card-elev overflow-hidden">
      <div className="border-b border-border p-4">
        <h3 className="text-sm font-semibold">用户管理</h3>
        <p className="mt-1 text-xs text-muted-foreground">仅管理员可登录系统。首位注册用户自动成为管理员，后续用户需在此手动授权。</p>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-accent/40 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">邮箱</th>
            <th className="px-3 py-2 text-left">注册时间</th>
            <th className="px-3 py-2 text-left">最后登录</th>
            <th className="px-3 py-2 text-left">角色</th>
            <th className="px-3 py-2 text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {isLoading && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">加载中…</td></tr>}
          {(data ?? []).map(u => (
            <tr key={u.id} className="border-t border-border">
              <td className="px-3 py-2 font-medium">{u.email ?? "—"}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{u.created_at ? new Date(u.created_at).toLocaleString() : "—"}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : "从未"}</td>
              <td className="px-3 py-2">
                {u.is_admin
                  ? <span className="inline-flex items-center gap-1 rounded bg-success/15 px-2 py-0.5 text-xs text-success"><ShieldCheck className="h-3 w-3" />管理员</span>
                  : <span className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">普通用户（无访问权限）</span>}
              </td>
              <td className="px-3 py-2 text-right">
                {u.is_admin
                  ? <button onClick={() => revoke.mutate(u.id)} className="btn-base btn-ghost text-xs"><ShieldOff className="h-3.5 w-3.5" />撤销</button>
                  : <button onClick={() => grant.mutate(u.id)} className="btn-base btn-primary text-xs"><ShieldCheck className="h-3.5 w-3.5" />授予管理员</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
