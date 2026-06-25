# 实施计划

## 1. 用户系统（仅管理员）
- 启用 Email/Password + Google OAuth 登录
- 新增 `user_roles` 表 + `app_role` enum（仅 `admin`）+ `has_role()` security definer 函数
- 新建 `/auth` 公开登录页（邮箱/密码 + Google）
- 将所有现有管理/操作页面（`/`, `/discover`, `/admin.*`, `/domains/*`, `/watchlist` 等）迁移到 `_authenticated/` 子树
- `_authenticated/route.tsx` 内增加 admin 角色校验：非 admin 用户登出并提示"仅管理员可访问"
- 首位注册用户自动授予 admin 角色（trigger on auth.users insert）；后续注册需现有 admin 在 `/admin.users` 页授权
- 现有数据表 RLS 策略收紧：从 anon 改为 `has_role(auth.uid(), 'admin')`

## 2. Enrich 任务系统（DNS / Archive / SEO）
新增表：
- `enrich_jobs` — id, source_job_id (关联 jobs), kinds (text[]: dns/archive/seo), status, total, done, failed, cached_hits, started_at, finished_at, error
- `enrich_items` — id, enrich_job_id, domain, kind, status (pending/running/done/error/cached), result jsonb, error, attempted_at
- `enrich_cache` — domain + kind 复合主键, payload jsonb, fetched_at, ttl_seconds（DNS=6h, Archive=7d, SEO=1d）

流程：
1. 批量 `jobs` 完成后（status='done'），如开关启用，自动 INSERT enrich_job 入队对应"未注册=可注册"或"已注册"域名（用户在创建任务时选择目标范围）
2. 后台 server fn `runEnrichBatchFn` 按 concurrency 处理 N 项；每项先查 `enrich_cache`（未过期则命中并标记 cached），未命中调用 `fetchDns`/`fetchArchive`/`fetchSeo` 后回写 cache 与 `domain_metrics`/`domain_dns`
3. 断点续查：进程中断后下次启动时 `enrich_items.status='pending'/'running'` 的继续；进度 = done+failed+cached / total

UI：
- `/enrich` 路由：列出所有 enrich_jobs，进度条（done/cached/failed/total）、速率、ETA
- 详情页 `/enrich/$id`：实时进度 + 最近完成 + 错误列表
- 在批量任务表单中加"完成后自动 enrich"开关 + 类型勾选（DNS / Archive / SEO）
- "继续执行"按钮（手动触发未完成项）

## 3. SEO 数据源
- 新增 `fetchSeo`：优先使用 Semrush 连接器（如已连接）取 domain_analysis 关键指标；否则置空并标记 skipped
- 写入 `domain_metrics`（da/pa/backlinks/traffic 等列已存在）

## 4. Enriched 结果批量导出
- 公开下载接口 `/api/public/enrich/$id/download?kind=enriched_csv|enriched_json|available_enriched_csv`
- 字段：domain, registered, registrar, expiry, dns_a, dns_ns, archive_first_year, archive_snapshots, seo_da, seo_backlinks, seo_traffic, score
- 通过短期签名 token（query param）+ 服务端校验 `enrich_jobs` 存在；非 PII，公共可访问以便 cron/外部下载

## 5. 边界与提示
- enrich concurrency 1-20，QPS 1-50，cache TTL 1h-30d 表单校验
- toast 错误提示（外部 API 失败、签名失效等）

## 技术细节
- 全部 server fn 加 `requireSupabaseAuth` + admin 角色校验
- 批量任务完成回调：在现有 `runJobBatchFn` 末尾检测 job 完成且 `params.auto_enrich=true` → 创建 enrich_job
- 客户端用 `useQuery` 轮询 enrich 进度（2s 间隔），完成后停止
- 表 GRANT：authenticated 完整 CRUD，无 anon

## 文件改动概要
- supabase migration：user_roles + enrich_jobs/items/cache + RLS 重写
- 新 `src/lib/enrich-jobs.functions.ts`、`src/lib/seo.server.ts`
- 改 `src/lib/rdap.functions.ts`（完成钩子）
- 新 `src/routes/auth.tsx`、`src/routes/_authenticated/enrich.tsx`、`enrich.$id.tsx`、`admin.users.tsx`
- 迁移所有现有受保护页面到 `_authenticated/`
- 新 `src/routes/api/public/enrich.$id.download.ts`
