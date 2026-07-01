import { enrichTerminalRow, generateMockDomains } from "@/lib/domain-terminal";

export type MockWatchItem = {
  id: number;
  domain: string;
  status: string;
  tags: string[];
  note: string | null;
  notify_before_drop: boolean;
  notify_on_available: boolean;
  notify_on_price_change: boolean;
  created_at: string;
};

export type MockPortfolioItem = {
  id: number;
  domain: string;
  registrar: string | null;
  expiry_date: string | null;
  note: string | null;
  tags: string[];
  created_at: string;
};

export type MockAlertItem = {
  id: number;
  domain: string;
  channel: "email" | "telegram" | "discord" | "webhook";
  event: string;
  enabled: boolean;
  created_at: string;
};

export type MockJobItem = {
  id: string;
  name: string;
  status: "pending" | "running" | "success" | "failed";
  total: number;
  checked: number;
  created_at: string;
};

type MockApiStore = {
  nextId: number;
  watchlist: MockWatchItem[];
  portfolio: MockPortfolioItem[];
  alerts: MockAlertItem[];
  jobs: MockJobItem[];
};

declare global {
  var __domainHunterMockApiStore: MockApiStore | undefined;
}

export function getMockStore() {
  if (!globalThis.__domainHunterMockApiStore) {
    const seeds = generateMockDomains(5000);
    globalThis.__domainHunterMockApiStore = {
      nextId: 100,
      watchlist: seeds.slice(0, 3).map((row, index) => ({
        id: index + 1,
        domain: row.domain,
        status: index === 0 ? "target" : "watching",
        tags: index === 0 ? ["high-score", "drop-soon"] : ["mock"],
        note: index === 0 ? "Mock API seed: high potential candidate." : null,
        notify_before_drop: true,
        notify_on_available: index !== 2,
        notify_on_price_change: false,
        created_at: new Date(Date.now() - index * 3600000).toISOString(),
      })),
      portfolio: seeds.slice(3, 5).map((row, index) => ({
        id: index + 20,
        domain: row.domain,
        registrar: index === 0 ? "Namecheap" : "GoDaddy",
        expiry_date: new Date(Date.now() + (60 + index * 90) * 86400000).toISOString().slice(0, 10),
        note: "Mock portfolio asset.",
        tags: ["portfolio", row.tld.replace(".", "")],
        created_at: new Date(Date.now() - index * 86400000).toISOString(),
      })),
      alerts: [
        {
          id: 50,
          domain: seeds[0].domain,
          channel: "webhook",
          event: "available",
          enabled: true,
          created_at: new Date().toISOString(),
        },
      ],
      jobs: [
        {
          id: "mock-enrich-001",
          name: "Mock DNS / Archive enrichment",
          status: "running",
          total: 5000,
          checked: 1840,
          created_at: new Date(Date.now() - 7200000).toISOString(),
        },
      ],
    };
  }
  return globalThis.__domainHunterMockApiStore;
}

export function nextMockId() {
  const store = getMockStore();
  store.nextId += 1;
  return store.nextId;
}

export function toMockDomain(domain: string) {
  return enrichTerminalRow({ domain, source: "mock" });
}
