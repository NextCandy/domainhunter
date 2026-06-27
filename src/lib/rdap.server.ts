// Server-only helpers for RDAP/WHOIS lookups.
// Imported only from createServerFn handlers (server-side execution).

import net from "node:net";
import { query } from "@/lib/db.server";

// ── Port-43 WHOIS for ccTLDs that have no public RDAP server ──────────────────
// .cn / .com.cn / .net.cn / ... are operated by CNNIC, which exposes WHOIS over
// TCP/43 (whois.cnnic.cn) but is NOT in the IANA RDAP bootstrap. Key is the last
// label (split(".").pop()), e.g. "x.com.cn" → "cn".
const WHOIS_SERVERS: Record<string, string> = {
  cn: "whois.cnnic.cn",
};

function whoisQuery(server: string, domain: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    const socket = net.connect(43, server);
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => socket.write(domain + "\r\n"));
    socket.on("data", (chunk) => { data += chunk.toString("utf8"); });
    socket.once("end", () => resolve(data));
    socket.once("timeout", () => { socket.destroy(); reject(new Error("WHOIS timeout")); });
    socket.once("error", (e) => reject(e));
  });
}

function parseCnWhois(text: string): DomainInfo {
  if (/No matching record|the domain you want to register is available|not been registered/i.test(text)) {
    return { status: "available", source: "whois" };
  }
  if (/Domain Name:/i.test(text)) {
    const grab = (re: RegExp) => text.match(re)?.[1]?.trim() || undefined;
    return {
      status: "registered",
      source: "whois",
      registrar: grab(/Sponsoring Registrar:\s*(.+)/i),
      createdDate: grab(/Registration Time:\s*(.+)/i),
      expiresDate: grab(/Expiration Time:\s*(.+)/i),
      nameservers: [...text.matchAll(/Name Server:\s*(.+)/gi)].map((m) => m[1].trim().toLowerCase()).filter(Boolean),
      statuses: [...text.matchAll(/Domain Status:\s*(.+)/gi)].map((m) => m[1].trim()),
      dnssec: /DNSSEC:\s*signed/i.test(text),
    };
  }
  return { status: "unsupported", source: "whois", error: "WHOIS: unrecognized response" };
}

interface BootstrapEntry {
  tlds: string[];
  servers: string[];
}

interface BootstrapData {
  services: [string[], string[]][];
  fetched_at: number;
}

let memoryBootstrap: BootstrapData | null = null;
let memoryRootZone: Set<string> | null = null;

const BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RDAP_QPS = 5;

declare global {
  // eslint-disable-next-line no-var
  var __domainHunterRdapBucket:
    | { tokens: number; lastRefill: number; queue: Array<() => void>; qps: number; timer?: ReturnType<typeof setInterval> }
    | undefined;
}

function rdapQps() {
  const configured = Number(process.env.RDAP_GLOBAL_QPS ?? DEFAULT_RDAP_QPS);
  return Number.isFinite(configured) && configured > 0 ? Math.min(configured, 50) : DEFAULT_RDAP_QPS;
}

function bucket() {
  const qps = rdapQps();
  if (!globalThis.__domainHunterRdapBucket) {
    globalThis.__domainHunterRdapBucket = { tokens: qps, lastRefill: Date.now(), queue: [], qps };
  }
  const b = globalThis.__domainHunterRdapBucket;
  b.qps = qps;
  if (!b.timer) {
    b.timer = setInterval(() => {
      b.tokens = Math.min(b.qps, b.tokens + Math.max(1, Math.floor(b.qps / 5)));
      while (b.tokens > 0 && b.queue.length) {
        b.tokens -= 1;
        b.queue.shift()?.();
      }
    }, 200);
    b.timer.unref?.();
  }
  return b;
}

async function waitForRdapToken() {
  const b = bucket();
  if (b.tokens > 0) {
    b.tokens -= 1;
    return;
  }
  // RDAP 服务通常有严格频率限制；这里使用进程内令牌桶让单次与批量查询排队等待。
  await new Promise<void>((resolve) => b.queue.push(resolve));
}

async function loadCached(key: string): Promise<any | null> {
  try {
    const { rows } = await query<{ data: unknown; updated_at: string }>(
      `SELECT data, updated_at FROM public.tlds_cache WHERE key = $1 LIMIT 1`,
      [key],
    );
    const row = rows[0];
    if (!row) return null;
    const age = Date.now() - new Date(row.updated_at).getTime();
    if (age > BOOTSTRAP_TTL_MS) return null;
    return row.data;
  } catch (error: any) {
    console.error(`[RDAP缓存] 读取 ${key} 失败:`, error?.message ?? error);
    return null;
  }
}

async function saveCached(key: string, value: any) {
  try {
    await query(
      `INSERT INTO public.tlds_cache (key, data, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [key, JSON.stringify(value)],
    );
  } catch (error: any) {
    console.error(`[RDAP缓存] 写入 ${key} 失败:`, error?.message ?? error);
  }
}

export async function getBootstrap(): Promise<BootstrapData> {
  if (memoryBootstrap && Date.now() - memoryBootstrap.fetched_at < BOOTSTRAP_TTL_MS) {
    return memoryBootstrap;
  }
  const cached = await loadCached("rdap_bootstrap");
  if (cached) {
    memoryBootstrap = cached as BootstrapData;
    return memoryBootstrap;
  }
  const res = await fetch("https://data.iana.org/rdap/dns.json", {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Bootstrap fetch failed: ${res.status}`);
  const json = (await res.json()) as { services: [string[], string[]][] };
  const data: BootstrapData = { services: json.services, fetched_at: Date.now() };
  memoryBootstrap = data;
  await saveCached("rdap_bootstrap", data);
  return data;
}

/** All TLDs in the IANA root zone (RDAP-supported or not). */
export async function getRootZoneTlds(): Promise<string[]> {
  if (memoryRootZone) return [...memoryRootZone];
  const cached = await loadCached("root_zone");
  if (cached && Array.isArray(cached)) {
    memoryRootZone = new Set(cached);
    return [...memoryRootZone];
  }
  const res = await fetch("https://data.iana.org/TLD/tlds-alpha-by-domain.txt", {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error("Root zone fetch failed");
  const text = await res.text();
  const tlds = text
    .split("\n")
    .map((l) => l.trim().toLowerCase())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("xn--"));
  memoryRootZone = new Set(tlds);
  await saveCached("root_zone", tlds);
  return tlds;
}

export async function getRdapSupportedTlds(): Promise<string[]> {
  const b = await getBootstrap();
  const set = new Set<string>();
  for (const [tlds] of b.services) {
    for (const t of tlds) set.add(t.toLowerCase());
  }
  return [...set];
}

export async function findRdapServer(tld: string): Promise<string | null> {
  const b = await getBootstrap();
  const t = tld.toLowerCase();
  for (const [tlds, servers] of b.services) {
    if (tlds.map((x) => x.toLowerCase()).includes(t)) {
      return servers[0] || null;
    }
  }
  return null;
}

export interface DomainInfo {
  status: "available" | "registered" | "unsupported" | "error" | "reserved";
  source: "rdap" | "whois" | "none";
  registrar?: string;
  createdDate?: string;
  expiresDate?: string;
  updatedDate?: string;
  nameservers?: string[];
  dnssec?: boolean;
  statuses?: string[];
  error?: string;
  raw?: any;
}

function pickEvent(events: any[] | undefined, action: string): string | undefined {
  if (!Array.isArray(events)) return undefined;
  const e = events.find((x) => x?.eventAction === action);
  return e?.eventDate;
}

function pickRegistrar(entities: any[] | undefined): string | undefined {
  if (!Array.isArray(entities)) return undefined;
  for (const e of entities) {
    const roles: string[] = e?.roles || [];
    if (roles.includes("registrar")) {
      const vcard = e?.vcardArray?.[1];
      if (Array.isArray(vcard)) {
        const fn = vcard.find((v: any) => v?.[0] === "fn");
        if (fn?.[3]) return fn[3];
      }
      return e?.handle || undefined;
    }
  }
  return undefined;
}

function parseRdapResponse(json: any): DomainInfo {
  const isReserved = (json?.status || []).some((s: string) =>
    /reserved|withheld|blocked/i.test(s),
  );
  return {
    status: isReserved ? "reserved" : "registered",
    source: "rdap",
    registrar: pickRegistrar(json?.entities),
    createdDate: pickEvent(json?.events, "registration"),
    expiresDate: pickEvent(json?.events, "expiration"),
    updatedDate: pickEvent(json?.events, "last changed") || pickEvent(json?.events, "last update of RDAP database"),
    nameservers: Array.isArray(json?.nameservers)
      ? json.nameservers.map((n: any) => (n?.ldhName || "").toLowerCase()).filter(Boolean)
      : [],
    dnssec:
      json?.secureDNS?.delegationSigned === true ||
      (Array.isArray(json?.secureDNS?.dsData) && json.secureDNS.dsData.length > 0),
    statuses: json?.status || [],
  };
}

export async function lookupDomain(
  domain: string,
  opts: { timeoutMs?: number; retries?: number } = {},
): Promise<DomainInfo> {
  const timeoutMs = opts.timeoutMs ?? 30000;
  const retries = opts.retries ?? 1;
  const tld = domain.split(".").pop()!.toLowerCase();
  const server = await findRdapServer(tld);

  if (server) {
    let lastErr: any;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const base = server.endsWith("/") ? server : server + "/";
        const url = base + "domain/" + encodeURIComponent(domain);
        await waitForRdapToken();
        const res = await fetch(url, {
          headers: { Accept: "application/rdap+json, application/json" },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.status === 404) {
          return { status: "available", source: "rdap" };
        }
        if (res.status === 200) {
          const json = await res.json();
          return parseRdapResponse(json);
        }
        if (res.status === 429 || res.status >= 500) {
          lastErr = new Error(`RDAP ${res.status}`);
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        // Other status codes - try to parse as not found patterns
        if (res.status === 400 || res.status === 403) {
          // Often "not found" for some RDAP servers
          try {
            const j = await res.json();
            if (j?.errorCode === 404 || /not found|does not exist/i.test(j?.title || "")) {
              return { status: "available", source: "rdap" };
            }
          } catch {}
        }
        lastErr = new Error(`RDAP unexpected ${res.status}`);
      } catch (e: any) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
    }
    return { status: "error", source: "rdap", error: lastErr?.message || "RDAP error" };
  }

  // No RDAP server for this TLD — try a direct port-43 WHOIS server if we know
  // one (e.g. CNNIC for .cn / .com.cn).
  const whoisServer = WHOIS_SERVERS[tld];
  if (whoisServer) {
    let lastErr: any;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await waitForRdapToken();
        const info = parseCnWhois(await whoisQuery(whoisServer, domain, timeoutMs));
        if (info.status !== "unsupported") return info;
        lastErr = new Error(info.error || "WHOIS: unrecognized response");
      } catch (e: any) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
    }
    return { status: "error", source: "whois", error: lastErr?.message || "WHOIS error" };
  }

  // No RDAP - try IANA WHOIS web fallback (best-effort)
  try {
    await waitForRdapToken();
    const res = await fetch(`https://www.iana.org/whois?q=${encodeURIComponent(domain)}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) {
      const text = await res.text();
      const m = text.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
      const body = (m?.[1] || text).replace(/<[^>]+>/g, "");
      if (/NOT FOUND|No match for|Domain not found/i.test(body)) {
        return { status: "available", source: "whois" };
      }
      if (/Domain Name:/i.test(body) || /Registrar:/i.test(body)) {
        const registrar = body.match(/Registrar:\s*(.+)/i)?.[1]?.trim();
        const created = body.match(/Creation Date:\s*(.+)/i)?.[1]?.trim();
        const expires = body.match(/Registry Expiry Date:\s*(.+)/i)?.[1]?.trim();
        return {
          status: "registered",
          source: "whois",
          registrar,
          createdDate: created,
          expiresDate: expires,
        };
      }
    }
  } catch {
    /* fall through */
  }
  return { status: "unsupported", source: "none", error: "No RDAP and WHOIS fallback failed" };
}
