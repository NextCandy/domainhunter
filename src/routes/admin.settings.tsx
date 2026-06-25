import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getSettingsFn, saveSettingsFn, sendTestNotificationFn } from "@/lib/discover.functions";
import { toast } from "sonner";
import { Send } from "lucide-react";

export const Route = createFileRoute("/admin/settings")({
  component: AdminSettings,
});

type SettingsShape = {
  site_name?: string;
  default_lang?: string;
  timezone?: string;
  notify_email?: string;
  notify_telegram?: string;
  notify_bark?: string;
  notify_webhook?: string;
};

function AdminSettings() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["app-settings"], queryFn: () => getSettingsFn() });
  const [form, setForm] = useState<SettingsShape>({});
  useEffect(() => { if (data) setForm(data as SettingsShape); }, [data]);

  const save = useMutation({
    mutationFn: () => saveSettingsFn({ data: { settings: form } }),
    onSuccess: () => { toast.success("已保存"); qc.invalidateQueries({ queryKey: ["app-settings"] }); },
    onError: (e: any) => toast.error(e?.message ?? "保存失败"),
  });
  const testNotify = useMutation({
    mutationFn: () => sendTestNotificationFn({ data: { bark: form.notify_bark ?? "", webhook: form.notify_webhook ?? "" } }),
    onSuccess: r => {
      const okN = r.results.filter(x => x.ok).length;
      const failN = r.results.length - okN;
      if (failN === 0) toast.success(`已发送 ${okN} 条测试通知`);
      else toast.warning(`成功 ${okN} · 失败 ${failN}：${r.results.filter(x => !x.ok).map(x => `${x.channel}(${x.status ?? x.error})`).join(", ")}`);
    },
    onError: (e: any) => toast.error(e?.message ?? "发送失败"),
  });

  const F = (k: keyof SettingsShape, label: string, placeholder?: string) => (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <input value={form[k] ?? ""} onChange={e => setForm({ ...form, [k]: e.target.value })} placeholder={placeholder} className="field" />
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card-elev p-5">
        <h3 className="mb-3 text-sm font-semibold">站点</h3>
        <div className="space-y-3">
          {F("site_name", "站点名称", "DomainHunter")}
          {F("default_lang", "默认语言", "zh-CN")}
          {F("timezone", "时区", "Asia/Shanghai")}
        </div>
      </section>
      <section className="card-elev p-5">
        <h3 className="mb-3 text-sm font-semibold">通知通道</h3>
        <div className="space-y-3">
          {F("notify_email", "邮件接收", "you@example.com")}
          {F("notify_telegram", "Telegram Bot Token", "")}
          {F("notify_bark", "Bark URL", "https://api.day.app/xxx")}
          {F("notify_webhook", "Webhook URL", "https://...")}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={() => testNotify.mutate()} disabled={testNotify.isPending || (!form.notify_bark && !form.notify_webhook)} className="btn-base btn-ghost"><Send className="h-4 w-4" />{testNotify.isPending ? "发送中…" : "发送测试通知"}</button>
          <p className="text-[11px] text-muted-foreground">支持 Bark / 通用 Webhook（POST JSON）。邮件 / Telegram 将在后续接入。</p>
        </div>
      </section>
      <div className="lg:col-span-2">
        <button onClick={() => save.mutate()} disabled={save.isPending} className="btn-base btn-primary">{save.isPending ? "保存中…" : "保存全部设置"}</button>
      </div>
    </div>
  );
}
