import { createFileRoute } from "@tanstack/react-router";
import { BatchRdapPage } from "@/components/batch-rdap";

export const Route = createFileRoute("/tools/batch-rdap")({
  head: () => ({
    meta: [
      { title: "域名查询 — 批量 RDAP/WHOIS 查询工具" },
      {
        name: "description",
        content:
          "支持多个后缀、自定义格式、QPS/并发控制的批量域名可注册性查询工具，基于 IANA RDAP/WHOIS。",
      },
      { property: "og:title", content: "域名查询 — 批量 RDAP/WHOIS 查询工具" },
      {
        property: "og:description",
        content:
          "支持多个后缀、自定义格式、QPS/并发控制的批量域名可注册性查询工具，基于 IANA RDAP/WHOIS。",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap",
      },
    ],
  }),
  component: BatchRdapPage,
});
