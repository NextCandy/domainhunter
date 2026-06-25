import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
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

  // If already signed in, leave.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) nav({ to: "/" });
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
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("注册成功，请登录（首位注册用户自动成为管理员）");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("登录成功");
        nav({ to: "/" });
      }
    } catch (err: any) {
      toast.error(err?.message ?? "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    try {
      const r = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (r.error) throw r.error;
      if (!r.redirected) nav({ to: "/" });
    } catch (err: any) {
      toast.error(err?.message ?? "Google 登录失败");
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

        <div className="my-4 flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />或<div className="h-px flex-1 bg-border" />
        </div>

        <button onClick={google} disabled={busy}
          className="btn-base btn-ghost w-full justify-center border border-border">
          使用 Google 登录
        </button>

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
