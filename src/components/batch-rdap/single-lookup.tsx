import type * as React from "react";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { lookupDomainFn } from "@/lib/rdap.functions";
import type { DomainInfo } from "@/lib/rdap.server";
import { LookupResultCard, SectionTitle } from "./common";

export function SingleLookup() {
  const lookup = useServerFn(lookupDomainFn);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DomainInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setResult(null);
    const v = value.trim().toLowerCase();
    if (!v || !v.includes(".")) {
      setErr("请输入完整域名（含点号），例如 baidu.com");
      return;
    }
    setLoading(true);
    try {
      const r = await lookup({ data: { domain: v } });
      setResult(r as DomainInfo);
    } catch (e: any) {
      setErr(e?.message || "查询失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel p-5 sm:p-6">
      <SectionTitle title="域名查询信息" subtitle="单域名 RDAP/WHOIS 实时查询" />
      <div className="grid lg:grid-cols-[1fr_1.4fr] gap-5">
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block">
            <div className="text-xs text-muted-foreground mb-1.5">输入完整域名</div>
            <div className="flex gap-2">
              <input
                className="field"
                placeholder="例如 baidu.com"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              <button className="btn-base btn-primary" type="submit" disabled={loading}>
                {loading ? "查询中…" : "查询"}
              </button>
            </div>
          </label>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            横向显示注册信息，例如注册商、注册日、到期日、更新日、DNS、DNSSEC、注册局来源等。
          </p>
        </form>
        <div className="panel-inset min-h-[160px] p-4">
          {err && <div className="text-destructive text-sm">{err}</div>}
          {!err && !result && (
            <div className="text-sm text-muted-foreground">输入域名后，结果会显示在这里。</div>
          )}
          {result && <LookupResultCard domain={value} info={result} />}
        </div>
      </div>
    </section>
  );
}
