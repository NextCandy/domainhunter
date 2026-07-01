// Server-only helpers for RDAP/WHOIS lookups.
// Imported only from createServerFn handlers during server-side execution.

import net from "node:net";
import { domainToASCII } from "node:url";
import { query } from "@/lib/db.server";

const WHOIS_SERVER_OVERRIDES: Record<string, string> = {
  cn: "whois.cnnic.cn",
};

interface BootstrapData {
  services: [string[], string[]][];
  fetched_at: number;
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

let memoryBootstrap: BootstrapData | null = null;
let memoryRootZone: Set<string> | null = null;
const memoryWhoisReferrals = new Map<string, string | null>();

const BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RDAP_QPS = 5;

declare global {
  // eslint-disable-next-line no-var
  var __domainHunterRdapBucket:
    | {
        tokens: number;
        lastRefill: number;
        queue: Array<() => void>;
        qps: number;
        timer?: ReturnType<typeof setInterval>;
      }
    | undefined;
}

function rdapQps() {
  const configured = Number(process.env.RDAP_GLOBAL_QPS ?? DEFAULT_RDAP_QPS);
  return Number.isFinite(configured) && configured > 0
    ? Math.min(configured, 50)
    : DEFAULT_RDAP_QPS;
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
  await new Promise<void>((resolve) => b.queue.push(resolve));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    console.error(`[RDAP cache] read ${key} failed:`, error?.message ?? error);
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
    console.error(`[RDAP cache] write ${key} failed:`, error?.message ?? error);
  }
}

function normalizeLookupDomain(domain: string) {
  const trimmed = domain
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, "");
  return domainToASCII(trimmed) || trimmed;
}

function whoisQuery(server: string, domain: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    const socket = net.connect(43, server);
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => socket.write(`${domain}\r\n`));
    socket.on("data", (chunk) => {
      data += chunk.toString("utf8");
    });
    socket.once("end", () => resolve(data));
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error("WHOIS timeout"));
    });
    socket.once("error", (e) => reject(e));
  });
}

function parseWhoisReferral(text: string) {
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^(?:whois|refer):\s*([^\s#]+)/i);
    if (match?.[1]) return match[1].trim().replace(/\.$/, "").toLowerCase();
  }
  return null;
}

function grabWhoisLine(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const value = text.match(pattern)?.[1]?.trim();
    if (value) return value;
  }
  return undefined;
}

function uniqueWhoisLines(matches: IterableIterator<RegExpMatchArray>) {
  return Array.from(new Set([...matches].map((m) => m[1]?.trim()).filter(Boolean) as string[]));
}

function parseGenericWhois(text: string): DomainInfo {
  const body = text.replace(/\r/g, "");
  const availablePatterns = [
    /\bno match(?:ing)?(?: record)?\b/i,
    /\bnot found\b/i,
    /\bno entries found\b/i,
    /\bno data found\b/i,
    /\bno object found\b/i,
    /\bdomain not found\b/i,
    /\bno matching record\b/i,
    /\bnot registered\b/i,
    /\bis available\b/i,
    /\bavailable for registration\b/i,
    /\bobject does not exist\b/i,
    /\bqueried object does not exist\b/i,
    /^status:\s*(?:free|available)\b/im,
  ];

  if (availablePatterns.some((pattern) => pattern.test(body))) {
    return { status: "available", source: "whois" };
  }

  const registeredPatterns = [
    /^domain name:\s*/im,
    /^domain:\s*/im,
    /^registrar:\s*/im,
    /^sponsoring registrar:\s*/im,
    /^name server:\s*/im,
    /^nserver:\s*/im,
  ];

  if (registeredPatterns.some((pattern) => pattern.test(body))) {
    return {
      status: "registered",
      source: "whois",
      registrar: grabWhoisLine(body, [
        /^Registrar:\s*(.+)$/im,
        /^Sponsoring Registrar:\s*(.+)$/im,
        /^registrar:\s*(.+)$/im,
      ]),
      createdDate: grabWhoisLine(body, [
        /^Creation Date:\s*(.+)$/im,
        /^Created On:\s*(.+)$/im,
        /^Registration Time:\s*(.+)$/im,
        /^created:\s*(.+)$/im,
      ]),
      expiresDate: grabWhoisLine(body, [
        /^Registry Expiry Date:\s*(.+)$/im,
        /^Registrar Registration Expiration Date:\s*(.+)$/im,
        /^Expiration Time:\s*(.+)$/im,
        /^Expiry Date:\s*(.+)$/im,
        /^Expires On:\s*(.+)$/im,
        /^paid-till:\s*(.+)$/im,
      ]),
      updatedDate: grabWhoisLine(body, [
        /^Updated Date:\s*(.+)$/im,
        /^Last Updated On:\s*(.+)$/im,
        /^changed:\s*(.+)$/im,
      ]),
      nameservers: uniqueWhoisLines(body.matchAll(/^(?:Name Server|nserver):\s*(.+)$/gim)).map(
        (v) => v.toLowerCase(),
      ),
      statuses: uniqueWhoisLines(body.matchAll(/^(?:Domain Status|status):\s*(.+)$/gim)),
      dnssec: /^DNSSEC:\s*(?:signed|yes|true)/im.test(body),
    };
  }

  return { status: "unsupported", source: "whois", error: "WHOIS: unrecognized response" };
}

async function findWhoisServer(tld: string, timeoutMs: number) {
  const key = tld.toLowerCase();
  const override = WHOIS_SERVER_OVERRIDES[key];
  if (override) return override;

  if (memoryWhoisReferrals.has(key)) {
    return memoryWhoisReferrals.get(key) ?? null;
  }

  const cacheKey = `whois_referral:${key}`;
  const cached = await loadCached(cacheKey);
  if (cached && typeof cached === "object" && "server" in cached) {
    const server = typeof cached.server === "string" ? cached.server : null;
    memoryWhoisReferrals.set(key, server);
    return server;
  }

  try {
    const text = await whoisQuery("whois.iana.org", key, Math.min(timeoutMs, 15000));
    const server = parseWhoisReferral(text);
    memoryWhoisReferrals.set(key, server);
    await saveCached(cacheKey, { server, fetched_at: Date.now() });
    return server;
  } catch (error: any) {
    console.error(`[WHOIS referral] ${key} failed:`, error?.message ?? error);
    memoryWhoisReferrals.set(key, null);
    return null;
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

/** All TLDs in the IANA root zone, including IDN punycode labels. */
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
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line && !line.startsWith("#"));
  memoryRootZone = new Set(tlds);
  await saveCached("root_zone", tlds);
  return tlds;
}

export async function getRdapSupportedTlds(): Promise<string[]> {
  const bootstrap = await getBootstrap();
  const set = new Set<string>();
  for (const [tlds] of bootstrap.services) {
    for (const tld of tlds) set.add(tld.toLowerCase());
  }
  return [...set];
}

export async function findRdapServer(tld: string): Promise<string | null> {
  const bootstrap = await getBootstrap();
  const target = tld.toLowerCase();
  for (const [tlds, servers] of bootstrap.services) {
    if (tlds.some((item) => item.toLowerCase() === target)) {
      return servers[0] || null;
    }
  }
  return null;
}

function pickEvent(events: any[] | undefined, action: string): string | undefined {
  if (!Array.isArray(events)) return undefined;
  const event = events.find((item) => item?.eventAction === action);
  return event?.eventDate;
}

function pickRegistrar(entities: any[] | undefined): string | undefined {
  if (!Array.isArray(entities)) return undefined;
  for (const entity of entities) {
    const roles: string[] = entity?.roles || [];
    if (roles.includes("registrar")) {
      const vcard = entity?.vcardArray?.[1];
      if (Array.isArray(vcard)) {
        const fn = vcard.find((value: any) => value?.[0] === "fn");
        if (fn?.[3]) return fn[3];
      }
      return entity?.handle || undefined;
    }
  }
  return undefined;
}

function parseRdapResponse(json: any): DomainInfo {
  const isReserved = (json?.status || []).some((status: string) =>
    /reserved|withheld|blocked/i.test(status),
  );
  return {
    status: isReserved ? "reserved" : "registered",
    source: "rdap",
    registrar: pickRegistrar(json?.entities),
    createdDate: pickEvent(json?.events, "registration"),
    expiresDate: pickEvent(json?.events, "expiration"),
    updatedDate:
      pickEvent(json?.events, "last changed") ||
      pickEvent(json?.events, "last update of RDAP database"),
    nameservers: Array.isArray(json?.nameservers)
      ? json.nameservers.map((item: any) => (item?.ldhName || "").toLowerCase()).filter(Boolean)
      : [],
    dnssec:
      json?.secureDNS?.delegationSigned === true ||
      (Array.isArray(json?.secureDNS?.dsData) && json.secureDNS.dsData.length > 0),
    statuses: json?.status || [],
  };
}

async function tryRdapLookup(
  server: string,
  domain: string,
  timeoutMs: number,
): Promise<DomainInfo> {
  const base = server.endsWith("/") ? server : `${server}/`;
  const url = `${base}domain/${encodeURIComponent(domain)}`;
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

  if (res.status === 400 || res.status === 403) {
    const clone = res.clone();
    try {
      const json = await res.json();
      if (json?.errorCode === 404 || /not found|does not exist/i.test(json?.title || "")) {
        return { status: "available", source: "rdap" };
      }
    } catch {
      const body = await clone.text().catch(() => "");
      if (/not found|does not exist|no matching record/i.test(body)) {
        return { status: "available", source: "rdap" };
      }
    }
  }

  throw new Error(`RDAP unexpected ${res.status}`);
}

export async function lookupDomain(
  domain: string,
  opts: { timeoutMs?: number; retries?: number } = {},
): Promise<DomainInfo> {
  const timeoutMs = opts.timeoutMs ?? 30000;
  const retries = opts.retries ?? 1;
  const asciiDomain = normalizeLookupDomain(domain);
  const labels = asciiDomain.split(".");
  const tld = labels.at(-1)?.toLowerCase();
  if (!tld || labels.length < 2) {
    return { status: "error", source: "none", error: "Invalid domain" };
  }

  let rdapError: any;
  const rdapServer = await findRdapServer(tld).catch((error) => {
    rdapError = error;
    return null;
  });

  if (rdapServer) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await tryRdapLookup(rdapServer, asciiDomain, timeoutMs);
      } catch (error: any) {
        rdapError = error;
        await sleep(
          (error?.message || "").includes("429") ? 500 * (attempt + 1) : 300 * (attempt + 1),
        );
      }
    }
  }

  const whoisServer = await findWhoisServer(tld, timeoutMs);
  if (whoisServer) {
    let whoisError: any;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await waitForRdapToken();
        const info = parseGenericWhois(await whoisQuery(whoisServer, asciiDomain, timeoutMs));
        if (info.status !== "unsupported") return info;
        whoisError = new Error(info.error || "WHOIS: unrecognized response");
      } catch (error: any) {
        whoisError = error;
      }
      await sleep(300 * (attempt + 1));
    }
    return { status: "error", source: "whois", error: whoisError?.message || "WHOIS error" };
  }

  if (rdapError) {
    return { status: "error", source: "rdap", error: rdapError?.message || "RDAP error" };
  }

  return { status: "unsupported", source: "none", error: "No RDAP or WHOIS server found" };
}
