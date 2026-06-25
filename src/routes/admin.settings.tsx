import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getSettingsFn, saveSettingsFn } from "@/lib/discover.functions";
import { toast } from "sonner";

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
        <p className="mt-3 text-[11px] text-muted-foreground">本版本仅保存配置；实际通知发送将在后续接入。</p>
      </section>
      <div className="lg:col-span-2">
        <button onClick={() => save.mutate()} disabled={save.isPending} className="btn-base btn-primary">{save.isPending ? "保存中…" : "保存全部设置"}</button>
      </div>
    </div>
  );
}
