// Server-only helpers for DNS-over-HTTPS (Cloudflare), Wayback Archive
// availability, and notification dispatch (Bark / Webhook). All use free
// public APIs; failures are swallowed so callers degrade gracefully.

const DOH = "https://cloudflare-dns.com/dns-query";

async function dohQuery(name: string, type: string): Promise<string[]> {
  try {
    const r = await fetch(`${DOH}?name=${encodeURIComponent(name)}&type=${type}`, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return [];
    const j: any = await r.json();
    return (j.Answer ?? [])
      .filter((a: any) => String(a.type) === DNS_TYPE[type])
      .map((a: any) => String(a.data).replace(/^"|"$/g, ""));
  } catch {
    return [];
  }
}

const DNS_TYPE: Record<string, string> = { A: "1", NS: "2", MX: "15", TXT: "16", AAAA: "28" };

export async function fetchDns(domain: string) {
  const [a, ns, mx, txt] = await Promise.all([
    dohQuery(domain, "A"),
    dohQuery(domain, "NS"),
    dohQuery(domain, "MX"),
    dohQuery(domain, "TXT"),
  ]);
  return { a_records: a, ns_records: ns, mx_records: mx, txt_records: txt };
}

export async function fetchArchive(domain: string): Promise<{ archive_year: number | null; archive_count: number }> {
  try {
    const r = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(domain)}&timestamp=19960101`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return { archive_year: null, archive_count: 0 };
    const j: any = await r.json();
    const ts: string | undefined = j?.archived_snapshots?.closest?.timestamp;
    if (!ts || ts.length < 4) return { archive_year: null, archive_count: 0 };
    return { archive_year: parseInt(ts.slice(0, 4), 10), archive_count: 1 };
  } catch {
    return { archive_year: null, archive_count: 0 };
  }
}

export type NotifyChannel = "bark" | "webhook";
export interface NotifyResult { channel: NotifyChannel; ok: boolean; status?: number; error?: string }

export async function sendNotification(channels: { bark?: string; webhook?: string }, title: string, body: string): Promise<NotifyResult[]> {
  const out: NotifyResult[] = [];
  if (channels.bark) {
    try {
      const url = channels.bark.replace(/\/$/, "") + `/${encodeURIComponent(title)}/${encodeURIComponent(body)}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
      out.push({ channel: "bark", ok: r.ok, status: r.status });
    } catch (e: any) { out.push({ channel: "bark", ok: false, error: String(e?.message ?? e) }); }
  }
  if (channels.webhook) {
    try {
      const r = await fetch(channels.webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, body, ts: Date.now() }),
        signal: AbortSignal.timeout(6000),
      });
      out.push({ channel: "webhook", ok: r.ok, status: r.status });
    } catch (e: any) { out.push({ channel: "webhook", ok: false, error: String(e?.message ?? e) }); }
  }
  return out;
}
