// Server-only helpers for RDAP/WHOIS lookups.
// Imported only from createServerFn handlers (server-side execution).

import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

async function loadCached(key: string): Promise<any | null> {
  const { data } = await supabaseAdmin
    .from("tlds_cache")
    .select("data, updated_at")
    .eq("key", key)
    .maybeSingle();
  if (!data) return null;
  const age = Date.now() - new Date((data as any).updated_at).getTime();
  if (age > BOOTSTRAP_TTL_MS) return null;
  return (data as any).data;
}

async function saveCached(key: string, value: any) {
  await supabaseAdmin
    .from("tlds_cache")
    .upsert({ key, data: value, updated_at: new Date().toISOString() });
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

  // No RDAP - try IANA WHOIS web fallback (best-effort)
  try {
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
