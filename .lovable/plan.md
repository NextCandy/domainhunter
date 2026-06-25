## DomainHunter 升级计划：从批量查询工具 → 过期域名发现平台

当前项目是一个域名批量 RDAP 查询工具（带任务队列、审计日志）。本计划将其升级为一个完整的过期域名发现/筛选/评分/观察平台，参考 ExpiredDomains 的产品结构（不抓取其数据）。

### 一、范围与 MVP 优先级

考虑到工作量巨大，采用分阶段交付。**本次先交付 MVP（阶段 1+2），其余阶段后续按需推进。**

**阶段 1（核心数据层 + 评分）**
- 新建数据模型：`domains`、`domain_metrics`、`domain_whois`、`domain_dns`、`watchlist`、`registrars`、`data_sources`（与现有 `jobs`/`job_items`/`job_events` 共存）
- 评分引擎：100 分制规则化模型（长度/语义/后缀/Archive/外链/相关后缀/风险扣分），可在 `/admin/scoring` 调整权重
- 数据导入：TXT/CSV 导入 → 写入 `domains` → 自动入队 RDAP 检查 → 评分
- 复用现有 RDAP 引擎做"可注册"检测，结果写入 `domains.status` + `domain_whois`

**阶段 2（核心 UI）**
- 浅色风格重设计（背景 #F6F8FB / 主色 #2563EB），保留终端式工具作为子页 `/tools/batch-rdap`
- 新顶部导航：DomainHunter / 发现 / 已删除 / 待删除 / 拍卖 / 观察 / 我的域名 / 后台
- `/` 首页：搜索框 + 5 张概览卡（今日新增 / 可注册 / 待删除 / 高分 / 观察中）+ 推荐域名列表
- `/discover` 发现页：左侧筛选器（后缀、长度、状态、字符类型、关键词、正则、最低评分、Archive 年份、外链、删除时间），右侧服务端分页表格（综合评分、状态、BL、DP、ABY、删除时间、操作）。移动端筛选器改为底部抽屉、列表改为卡片
- `/deleted`、`/pending`、`/auctions`：基于 `/discover` 的预设过滤视图（拍卖表保留 platform/price/end_time 字段但暂不接入真实 API）
- `/watchlist`：观察列表 CRUD + 标签 + 备注 + 提醒开关（提醒触发通道留接口，不发邮件）
- `/domains/:domain` 详情页：基础信息 + WHOIS/RDAP + DNS（占位） + Archive/SEO（占位） + 相关后缀检查（实时复用 RDAP）
- `/my-domains`：已购域名管理（手动录入）

**阶段 3（后台 + 任务，本次仅留入口与最小实现）**
- `/admin/sources`：TXT/CSV 导入 UI（启用）
- `/admin/scoring`：评分权重编辑（启用）
- `/admin/settings`：站点名/主题色/通知开关（启用，仅本地保存）
- `/admin/registrars`、`/admin/jobs`：UI 骨架 + 配置存储（密钥用 base64 占位加密，真实接入留待后续）

**阶段 4（暂不在本次交付）**
- 真实 SEO/Archive API 接入（Ahrefs / Wayback 真实查询）
- 注册商 API 真实下单
- 邮件 / Telegram / Bark / Webhook 通知发送
- 用户系统（本次假定单用户/匿名，沿用现有匿名 RLS）

### 二、技术要点

- **栈**：保留 TanStack Start + Lovable Cloud（Supabase）+ Tailwind v4
- **路由**：在 `src/routes/` 新增 `discover.tsx`、`deleted.tsx`、`pending.tsx`、`auctions.tsx`、`watchlist.tsx`、`my-domains.tsx`、`domains.$domain.tsx`、`admin.tsx`（layout）+ admin 子路由、`tools.batch-rdap.tsx`（迁移现有 `index.tsx` 内容）
- **服务端函数**：`src/lib/discover.functions.ts`（分页查询 + 多列筛选/排序）、`src/lib/scoring.ts`（纯函数评分）、`src/lib/import.functions.ts`（导入 + 入队）、`src/lib/watchlist.functions.ts`
- **性能**：服务端分页（默认 50/页），筛选字段建索引（domain/tld/status/score/length/drop_date/archive_year/backlinks/risk_level）
- **安全**：注册商密钥字段命名 `*_encrypted`、`/admin/*` 暂用单一访问密码门控（写入 localStorage + server 校验环境变量，未配置时允许本地访问并显示提示）
- **设计令牌**：在 `src/styles.css` 重写 oklch 令牌为浅色面板风格

### 三、文件改动概览

- 新建迁移：domains/metrics/whois/dns/watchlist/registrars/data_sources/scoring_rules（含 GRANT + RLS + 索引）
- 新建 `src/lib/scoring.ts`、`src/lib/discover.functions.ts`、`src/lib/import.functions.ts`、`src/lib/watchlist.functions.ts`、`src/lib/admin.functions.ts`
- 新建路由若干（见上）；将现有 `src/routes/index.tsx` 拆为新 `index.tsx`（概览）+ `tools.batch-rdap.tsx`（保留原全部功能）
- 新建组件：`AppShell`（顶部导航）、`StatCard`、`DomainTable`、`DomainCardMobile`、`FilterPanel`、`FilterDrawer`、`ScoreBadge`、`RiskBadge`
- `src/styles.css`：浅色主题令牌
- `src/routes/__root.tsx`：使用 `AppShell` 包裹

### 四、明确不做

- 不爬取 ExpiredDomains 任何数据；所有"已删除/待删除/拍卖"数据均来自用户导入或现有 RDAP 检测结果
- 不接入真实 Ahrefs/Majestic/Wayback API（字段保留，值为空或 0）
- 不实现自动抢注/自动购买
- 不实现真实通知发送
