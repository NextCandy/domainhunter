# DomainHunter · 过期域名发现 / 评分 / 观察平台

> 自托管的过期域名（expired / dropping domain）发现、评分、观察与抢注辅助工具。
> 内置 RDAP/WHOIS 实时查询、批量扫描、SEO/Archive 数据丰富、注册商比价、AI 域名灵感等能力。

技术栈：**React 19 + TanStack Start + Vite 8 + Tailwind CSS v4 + PostgreSQL 16**，Bun 构建 / Node 20 运行，Docker 一键部署。

---

## ✨ 功能特性

### 域名发现与评分
- **多源域名库**：导入 TXT/CSV、批量候选生成（三/四字母、纯数字、混合、自定义格式 + 正则）。
- **100 分制评分引擎**（`src/lib/scoring.ts`，权重可在后台调整）：长度、语义、后缀、Archive 年龄、外链、相关 TLD 占用、品牌感、风险扣分共 8 个维度，输出 S/A/B/C/D 品牌等级。
- **高级筛选**：状态 / TLD / 长度 / 字符类型 / 评分 / 正则 / Archive 年份 / 外链 / 风险等级。
- **域名列表管理**：支持**多选批量删除**与**单条删除**（级联清理评分 / WHOIS / DNS / 观察记录）。

### 实时查询（RDAP / WHOIS）
- **IANA RDAP bootstrap** 自动选择各 TLD 的 RDAP 服务器，带令牌桶限流、重试、超时控制。
- **国内域名支持**：`.cn` / `.com.cn` / `.net.cn` 等由 CNNIC 运营、无公开 RDAP，自动回退到 **`whois.cnnic.cn` 端口 43 WHOIS** 查询，解析注册商、注册/到期时间、Name Server、状态等。
- **批量 RDAP 工具**（`/tools/batch-rdap`）：候选生成 + 持久化任务 + QPS/并发控制 + 断点续查 + 结果导出（available.txt / all_results.tsv / errors.txt / error_report.json）；**任务支持删除**。

### 数据丰富（Enrich）
- DNS 记录（A/NS/MX/TXT）、Wayback Machine Archive 年龄、SEO 指标（需 Semrush 连接器，可选）。
- 批量丰富任务：缓存命中、并发/QPS 控制、断点续跑、CSV/JSON 导出。

### 注册商比价与抢注
- **国际注册商**：Spaceship、Namecheap、Porkbun、Dynadot、NameSilo、Cloudflare、GoDaddy。
- **国内注册商**：阿里云（万网）、腾讯云、西部数码、华为云、新网。
- 按 TLD 对比注册/续费/转入价，应用优惠码，给出推荐购买评分与一键跳转购买链接。

### AI 域名灵感
- 根据关键词、行业、用途、语言、长度、后缀生成可注册域名候选，附记忆度 / 品牌感评分与理由。
- 兼容 **OpenAI 协议**，**默认使用 DeepSeek**（`deepseek-v4-flash`）。未配置 API Key 时自动回退到本地确定性生成算法（仍可用）。

### 观察 / 我的域名 / 其它
- 观察列表（状态、标签、备注、删除前提醒；支持 Bark / Webhook 通知通道）。
- 我的域名（已购域名管理、到期提醒）。
- 拍卖、待删除、已删除等多视图。
- 完整**后台管理**：数据源、评分规则、注册商、价格 / 优惠码、任务队列、任务历史、TLD 后缀、用户、系统设置。
- 本地 **email + 密码 + JWT** 认证（首个注册用户自动成为管理员），明 / 暗双主题。

---

## 🚀 快速部署（Docker Compose）

### 1. 准备环境变量

复制模板并填写：

```bash
cp .env.example .env
```

`.env` 关键变量：

| 变量 | 说明 | 必填 |
|---|---|---|
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | PostgreSQL 数据库 | ✅ |
| `JWT_SECRET` | JWT 签名密钥（≥ 32 字符随机串） | ✅ |
| `APP_ORIGIN` | 对外访问地址，如 `http://192.168.1.10:8832` | ✅ |
| `APP_PORT` | 宿主映射端口（默认 8832） | |
| `AI_BASE_URL` | AI 接口地址，默认 `https://api.deepseek.com` | |
| `AI_API_KEY` | AI API Key（DeepSeek `sk-...`），留空则用本地生成 | |
| `AI_MODEL` | 模型名，默认 `deepseek-v4-flash` | |
| `SEMRUSH_API_KEY` | SEO 数据（可选） | |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google 登录（可选） | |

> ⚠️ `.env` 含敏感信息，已被 `.gitignore` 排除，请勿提交。

### 2. 启动

```bash
# 群晖 / NAS（使用 docker-compose.nas.yml）
docker compose -f docker-compose.nas.yml up -d --build

# 标准环境
docker compose up -d --build
```

应用启动后访问 `http://<host>:8832`，**首个注册的用户自动成为管理员**。

### 3. 仅更新应用（不动数据库与其它服务）

```bash
docker compose -f docker-compose.nas.yml build app
docker compose -f docker-compose.nas.yml up -d --no-deps app
```

> 仅修改 `.env`（如填入 AI Key）时无需重新构建，直接重启即可：
> `docker compose -f docker-compose.nas.yml up -d --no-deps --force-recreate app`

---

## 🤖 配置 DeepSeek（默认 AI）

1. 在 [DeepSeek 开放平台](https://platform.deepseek.com/) 申请 API Key。
2. 在 `.env` 中设置：

   ```env
   AI_BASE_URL=https://api.deepseek.com
   AI_MODEL=deepseek-v4-flash
   AI_API_KEY=sk-你的key
   ```
3. 重启 app 容器即可。「域名灵感」将使用 DeepSeek 生成候选域名。

> 也兼容任何 OpenAI 协议接口（OpenAI、Moonshot、通义千问兼容端点等），改 `AI_BASE_URL` / `AI_MODEL` 即可。

---

## 🌐 域名查询说明

| 类型 | 查询方式 |
|---|---|
| gTLD（com / net / org / io / ai …） | IANA RDAP bootstrap → 对应 RDAP 服务器 |
| 多数 ccTLD | IANA RDAP bootstrap |
| **.cn / .com.cn / .net.cn 等** | **CNNIC `whois.cnnic.cn` 端口 43 WHOIS**（CNNIC 无公开 RDAP） |
| 其它无 RDAP 的 TLD | IANA WHOIS 网页兜底 |

如需支持更多无 RDAP 的国别后缀，在 `src/lib/rdap.server.ts` 的 `WHOIS_SERVERS` 映射中追加 `{ 后缀: "whois 服务器" }` 即可。

---

## 🏗 技术架构

```
前端   React 19 · TanStack Start/Router · Vite 8 · Tailwind v4 · Radix UI · Recharts
后端   TanStack Start Nitro (node-server preset) · createServerFn RPC
数据库 PostgreSQL 16（node-postgres，pg_trgm / pgcrypto / citext 扩展）
认证   本地 email/password + bcrypt + JWT（access + refresh token）
构建   Bun（构建）+ Node 20（运行）
部署   Docker 多阶段构建（oven/bun → node:20-alpine），Compose 编排
```

### 目录结构

```
src/
├── components/          # app-shell、domain-table（含批量删除）、discover-view、batch-rdap/*
├── lib/
│   ├── db.server.ts             # PostgreSQL 连接池（int8 解析为数字）
│   ├── auth.server.ts           # JWT 签发/验证 + bcrypt + 用户 CRUD
│   ├── auth-guards.ts           # requireAuth / requireAdmin 中间件（动态 import，避免泄漏进客户端）
│   ├── pg-shim.server.ts        # PostgREST 风格查询构造器（迁移自 Supabase）
│   ├── scoring.ts               # 评分引擎
│   ├── rdap.server.ts           # RDAP + CNNIC WHOIS(端口43) 查询
│   ├── rdap.functions.ts        # 批量 RDAP 任务（含 deleteJobFn）
│   ├── discover.functions.ts    # 发现/导入/观察/删除域名（含 deleteDomainsFn）等 server functions
│   ├── enrich-*.ts / enrich.server.ts  # DNS / Archive / SEO 丰富
│   ├── ideas.functions.ts + services/domain-generator.server.ts  # AI 域名灵感（DeepSeek）
│   └── pricing.functions.ts     # 注册商比价 / 优惠码
├── routes/             # TanStack 文件路由（30+ 页面 + /api/public/*）
└── styles.css          # Tailwind v4 + 明/暗主题变量

db/init/01_schema.sql   # 完整 schema + 注册商种子（含国内注册商）
```

---

## 🛠 本地开发

```bash
bun install
bun run dev          # 开发服务器
bun run build        # 生产构建（NITRO_PRESET=node-server）
bun run lint         # ESLint
```

需要本地 PostgreSQL，并在环境变量中提供 `DATABASE_URL`。

---

## 📌 备注

- 项目最初由 Lovable 生成、并从 Supabase 迁移到自托管 PostgreSQL + 本地 JWT 认证。
- `db/init/01_schema.sql` 仅在数据库**首次初始化**（数据目录为空）时执行；对已有库的结构变更需手动执行迁移（见 `db/migrations/`）。
- 详细的部署排错见 [`README.deploy.md`](README.deploy.md)。
