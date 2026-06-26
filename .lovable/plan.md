## 目标

将当前依赖 Lovable Cloud（Supabase 托管）的 DomainHunter 项目重构为可在群晖 DS923+（DSM 7，Container Manager）通过 `docker-compose up -d` 一键部署的自托管版本，数据库改为同一 compose 内的 PostgreSQL 16，并提交到已连接的 GitHub 仓库。

## 重要前置说明（请确认）

把整套 Supabase 替换为"裸 Postgres 直连"涉及代码面非常广，需要同时改写以下层（保留功能不变）：

1. **认证**：当前 Google OAuth + Supabase Auth + `auth.users` + `requireSupabaseAuth` 中间件 → 改为本地 email/password + JWT（cookie httpOnly），管理员首注册即 admin（保留现有逻辑）。Google OAuth 在自托管下需要用户自己申请 Google Client，默认先关闭，留接入位。
2. **数据访问**：所有 `supabase.from(...)`、RLS 策略、`has_role`、`user_roles` → 改为 `pg`（node-postgres）+ 服务端 `createServerFn` 内手动鉴权 + 业务层权限判断。RLS 仍保留在 DB 里作为兜底，但运行时统一用单一应用角色连接。
3. **类型**：移除 `src/integrations/supabase/*` 自动生成依赖，改为手写或用 `kysely-codegen` 生成的类型（计划用轻量手写 + zod 校验）。
4. **存储**：当前未使用 Supabase Storage，无需处理。
5. **AI Gateway**：Lovable AI（`LOVABLE_API_KEY`）在自托管下不可用 → 抽象成 `AI_PROVIDER` 环境变量，默认 `openai-compatible`（兼容 OpenAI / Ollama / DeepSeek），用户填 `AI_BASE_URL` + `AI_API_KEY` + `AI_MODEL` 即可。
6. **Semrush 连接器**：同样抽象为可选 env `SEMRUSH_API_KEY`，未配置则该面板降级。

## 交付物

### 部署文件（新增）

- `Dockerfile` — 多阶段，Node 20-alpine，`bun install && bun run build`，运行时 `node .output/server/index.mjs`（TanStack Start Nitro 产物）。
- `docker-compose.yml` — 三服务：
  - `postgres`（pg16-alpine，持久卷 `./data/pg`，仅内网暴露）
  - `app`（构建本仓库，端口 `3000`，依赖 postgres healthcheck）
  - `migrate`（一次性运行 SQL 迁移，退出即可）
- `db/init/*.sql` — 从现有 `supabase/migrations/` 合并而来的纯 Postgres 初始化脚本（去掉 `auth.users` FK，新增 `app_users` 表；保留 `user_roles`、`app_role` 枚举、所有业务表、`pg_trgm` 扩展、触发器、`has_role` 函数）。
- `.env.example` — `DATABASE_URL`、`JWT_SECRET`、`SESSION_SECRET`、`AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL`、`SEMRUSH_API_KEY`、`GOOGLE_CLIENT_ID/SECRET`(可选)、`APP_ORIGIN`、`PORT`。
- `README.deploy.md` — 群晖 DS923 部署步骤（SSH 启用 → Container Manager → 上传 compose → 初始化管理员账号 → 反代 + HTTPS）。
- `.dockerignore`、`.gitignore` 补齐。

### 代码重构（替换）

- `src/server/db.ts` — `pg` Pool 单例，从 `DATABASE_URL` 读取。
- `src/server/auth.ts` — JWT 签发/校验、bcrypt 密码、`requireAuth` / `requireAdmin` 中间件（替代 `requireSupabaseAuth` + `assertAdmin`）。
- `src/server/ai.ts` — `chatCompletion()`，OpenAI 兼容 fetch 封装，替代 Lovable AI Gateway 调用。
- `src/integrations/supabase/*` — **删除**。所有引用改为 `@/server/db` + `@/server/auth`。
- `src/routes/_authenticated/route.tsx` — 改为读取本地 `/api/auth/me` 而不是 `supabase.auth.getUser()`。
- `src/routes/auth.tsx` — email/password 表单 + 可选 Google 按钮。
- `src/start.ts` — 移除 Supabase bearer attacher，改为本地 cookie 自动随同 `fetch`（serverFn 默认 `credentials: 'include'`）。
- `src/lib/*.functions.ts`（约 12 个）— 把每个 `.from('table').select()` 替换为 `db.query('select ... from table where ...', [params])`，并在 handler 内手动做权限判断。

### GitHub 推送

项目已通过 Lovable 的 GitHub 集成连接，所有上述改动会在批准后**自动同步到仓库的 default 分支**，无需我执行 git 命令。完成后会给出仓库链接确认。

## 工作量与节奏

代码重构面非常大（约 30~40 个文件改动 + 4 个新文件 + 删除 Supabase 集成），将分 **3 个连续阶段** 推进，每阶段结束都能 `bun run build` 通过：

1. **阶段 A**：Docker 部署骨架 + Postgres 初始化 SQL + DB/Auth/AI 抽象层 + README（不删 Supabase，先双轨编译通过）。
2. **阶段 B**：迁移核心 serverFn（`pricing` / `ideas` / `discover` / `enrich` / `jobs` / `admin`）到 `pg` 直连，删除 `supabase/client.server`、`auth-middleware`、`auth-attacher`、所有 `supabase.from(...)`。
3. **阶段 C**：重写 `/auth` 与 `_authenticated` 守卫，删除 `src/integrations/supabase/*` 与 `supabase/` 目录，最终验证 `bun run build` + 本地 `docker compose up` 烟测说明。

## 用户需自行准备的事项

- 群晖：DSM 7.2+，安装 **Container Manager**，开启 SSH（首次部署用）。
- 把 `.env.example` 复制为 `.env` 并填写至少 `JWT_SECRET`（32+ 随机串）和 `AI_*`（如需 AI 灵感生成）。
- 反代：DSM "控制面板 → 登录入口 → 反向代理"，把自有域名指向 `localhost:3000` 并申请 Let's Encrypt 证书。
- 首次访问 `/auth` 注册的账号将自动成为管理员（沿用现有 `handle_new_user_admin` 触发器逻辑，改写到 `app_users` 触发器）。

## 风险与取舍

- Lovable 的预览环境**仍依赖 Lovable Cloud**；本次重构后预览页会要求本地 Postgres，无法在 Lovable 在线预览继续 demo。如果你希望"预览继续用 Lovable Cloud + 部署用自托管"，请告诉我，我会改为**双模式**：通过 `BACKEND=supabase|selfhost` 环境变量切换。
- Google OAuth 在自托管下默认禁用，待用户配置 Client 后启用。

---

请确认是否：
A) 按上述全量重构推进（预览将不可用，只能 docker 跑）；或
B) 改为**双模式**保留 Lovable 预览同时支持 docker 部署（工作量再增约 30%）。
