import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getCurrentUser, login, register } from "@/lib/auth-client";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getCurrentUser().then((user) => {
      if (user) nav({ to: "/" });
    });
  }, [nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || password.length < 6) {
      toast.error("请输入有效邮箱并使用至少 6 位密码");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        await register(email, password);
        toast.success("注册成功，首位注册用户会自动成为管理员");
        nav({ to: "/" });
      } else {
        await login(email, password);
        toast.success("登录成功");
        nav({ to: "/" });
      }
    } catch (err: any) {
      const message = String(err?.message ?? "操作失败");
      toast.error(message.includes("fetch") ? "网络异常，请稍后重试" : message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-md bg-primary text-primary-foreground font-bold">DH</div>
          <h1 className="text-lg font-semibold">DomainHunter 管理员登录</h1>
          <p className="mt-1 text-xs text-muted-foreground">仅管理员可访问 · 首位注册自动获得管理员权限</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">邮箱</label>
            <input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)}
              className="field mt-1 w-full" placeholder="admin@example.com" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">密码</label>
            <input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={6}
              value={password} onChange={e => setPassword(e.target.value)} className="field mt-1 w-full" placeholder="••••••••" />
          </div>
          <button type="submit" disabled={busy} className="btn-base btn-primary w-full justify-center">
            {busy ? "处理中…" : mode === "signin" ? "登录" : "注册"}
          </button>
        </form>

        <div className="mt-4 text-center text-xs text-muted-foreground">
          {mode === "signin" ? (
            <>没有账号？<button onClick={() => setMode("signup")} className="text-primary hover:underline">注册管理员</button></>
          ) : (
            <>已有账号？<button onClick={() => setMode("signin")} className="text-primary hover:underline">去登录</button></>
          )}
        </div>
      </div>
    </div>
  );
}
