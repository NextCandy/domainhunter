import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getSettingsFn, saveSettingsFn, sendTestNotificationFn } from "@/lib/discover.functions";
import { LIMITS } from "@/lib/rdap.functions";
import { ENRICH_LIMITS } from "@/lib/enrich-jobs.functions";
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
  notify_before_drop_days?: number;
  // Global RDAP limits (defaults applied in UI forms)
  limit_default_qps?: number;
  limit_default_concurrency?: number;
  limit_default_per_host_qps?: number;
  limit_default_timeout_sec?: number;
  limit_default_retries?: number;
  limit_default_batch_size?: number;
  // Enrich defaults
  enrich_default_qps?: number;
  enrich_default_concurrency?: number;
  enrich_default_cache_ttl_seconds?: number;
  enrich_default_batch_size?: number;
};

function AdminSettings() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["app-settings"], queryFn: () => getSettingsFn() });
  const [form, setForm] = useState<SettingsShape>({});
  useEffect(() => {
    if (data) setForm(data as SettingsShape);
  }, [data]);

  const save = useMutation({
    mutationFn: () => saveSettingsFn({ data: { settings: form } }),
    onSuccess: () => {
      toast.success("已保存");
      qc.invalidateQueries({ queryKey: ["app-settings"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "保存失败"),
  });
  const testNotify = useMutation({
    mutationFn: () =>
      sendTestNotificationFn({
        data: { bark: form.notify_bark ?? "", webhook: form.notify_webhook ?? "" },
      }),
    onSuccess: (r) => {
      const okN = r.results.filter((x) => x.ok).length;
      const failN = r.results.length - okN;
      if (failN === 0) toast.success(`已发送 ${okN} 条测试通知`);
      else
        toast.warning(
          `成功 ${okN} · 失败 ${failN}：${r.results
            .filter((x) => !x.ok)
            .map((x) => `${x.channel}(${x.status ?? x.error})`)
            .join(", ")}`,
        );
    },
    onError: (e: any) => toast.error(e?.message ?? "发送失败"),
  });

  const T = (k: keyof SettingsShape, label: string, placeholder?: string) => (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <input
        value={(form[k] as string) ?? ""}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        placeholder={placeholder}
        className="field"
      />
    </div>
  );

  const N = (
    k: keyof SettingsShape,
    label: string,
    bounds: { min: number; max: number; default: number },
    suffix?: string,
  ) => {
    const cur = form[k] as number | undefined;
    const placeholder = `默认 ${bounds.default}${suffix ?? ""} · 范围 ${bounds.min}–${bounds.max}`;
    return (
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
        <input
          type="number"
          min={bounds.min}
          max={bounds.max}
          value={cur ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") {
              const f = { ...form };
              delete f[k];
              setForm(f);
              return;
            }
            const n = Math.max(bounds.min, Math.min(bounds.max, Number(v)));
            setForm({ ...form, [k]: n });
          }}
          placeholder={placeholder}
          className="field"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">{placeholder}</p>
      </div>
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card-elev p-5">
        <h3 className="mb-3 text-sm font-semibold">站点</h3>
        <div className="space-y-3">
          {T("site_name", "站点名称", "DomainHunter")}
          {T("default_lang", "默认语言", "zh-CN")}
          {T("timezone", "时区", "Asia/Shanghai")}
        </div>
      </section>

      <section className="card-elev p-5">
        <h3 className="mb-3 text-sm font-semibold">通知通道</h3>
        <div className="space-y-3">
          {T("notify_email", "邮件接收", "you@example.com")}
          {T("notify_telegram", "Telegram Bot Token", "")}
          {T("notify_bark", "Bark URL", "https://api.day.app/xxx")}
          {T("notify_webhook", "Webhook URL", "https://...")}
          {N("notify_before_drop_days", "删除前提醒窗口", { min: 1, max: 30, default: 3 }, " 天")}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => testNotify.mutate()}
            disabled={testNotify.isPending || (!form.notify_bark && !form.notify_webhook)}
            className="btn-base btn-ghost"
          >
            <Send className="h-4 w-4" />
            {testNotify.isPending ? "发送中…" : "发送测试通知"}
          </button>
          <p className="text-[11px] text-muted-foreground">
            支持 Bark / 通用 Webhook（POST JSON）。
          </p>
        </div>
      </section>

      <section className="card-elev p-5 lg:col-span-2">
        <h3 className="mb-1 text-sm font-semibold">全局 RDAP / 批量任务默认值</h3>
        <p className="mb-3 text-[11px] text-muted-foreground">
          在「批量
          RDAP」表单新建任务时作为默认值预填，服务端仍以硬性边界（min/max）作为最终上限校验。
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {N("limit_default_qps", "QPS", LIMITS.qps)}
          {N("limit_default_concurrency", "并发", LIMITS.concurrency)}
          {N("limit_default_per_host_qps", "单 Host QPS", LIMITS.perHostQps)}
          {N("limit_default_timeout_sec", "超时", LIMITS.timeoutSec, " 秒")}
          {N("limit_default_retries", "重试次数", LIMITS.retries)}
          {N("limit_default_batch_size", "批处理大小", LIMITS.batchSize)}
        </div>
      </section>

      <section className="card-elev p-5 lg:col-span-2">
        <h3 className="mb-1 text-sm font-semibold">Enrich 默认参数 & 缓存 TTL</h3>
        <p className="mb-3 text-[11px] text-muted-foreground">
          DNS / Archive / SEO 抓取的默认执行参数与缓存有效期。命中缓存的请求不消耗外部 API 配额。
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {N("enrich_default_qps", "Enrich QPS", ENRICH_LIMITS.qps)}
          {N("enrich_default_concurrency", "Enrich 并发", ENRICH_LIMITS.concurrency)}
          {N("enrich_default_batch_size", "Enrich 批大小", ENRICH_LIMITS.batchSize)}
          {N("enrich_default_cache_ttl_seconds", "缓存 TTL", ENRICH_LIMITS.cacheTtl, " 秒")}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          TTL 建议：DNS 6–24 小时（21600–86400），Archive 7 天（604800），SEO 1–7 天。
        </p>
      </section>

      <div className="lg:col-span-2">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="btn-base btn-primary"
        >
          {save.isPending ? "保存中…" : "保存全部设置"}
        </button>
      </div>
    </div>
  );
}
