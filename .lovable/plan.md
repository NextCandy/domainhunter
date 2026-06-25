# Domain Hunter 功能融合升级计划

将 mcpmarket domain-hunter 的产品逻辑融入现有项目，**不推倒重写**，在现有 `domains / jobs / enrich_jobs / watchlist / my_domains / registrars` 等表与页面基础上渐进扩展。

## 现状评估（基于当前代码）
- 已有：RDAP 批量发现、Enrich（DNS/Archive/SEO）、watchlist、my_domains、registrars、admin（设置/历史/TLD/用户）、auth。
- 缺失：域名灵感生成、注册商价格对比页、优惠码管理、购买建议、注册商 API 密钥加密管理、Spaceship Provider。

## 分阶段交付（每阶段独立可运行）

### 阶段 1 — 数据层（迁移）
- 扩展 `registrars`：新增 `slug, website, api_enabled, api_base_url, api_key_encrypted, api_secret_encrypted, status, notes`（兼容旧字段）。
- 新增 `registrar_prices`：tld、首年/续费/转入、币种、隐私免费、API 支持、更新时间。
- 新增 `coupons`：注册商、码、标题、TLD 范围、折扣类型、有效期、来源、verified、status。
- 新增 `domain_ideas`：用户生成的灵感记录（关键词、参数、结果 JSON）。
- 复用现有 `domains` 表作为 `domain_checks` 视角，状态字段扩展枚举：`available/taken/premium/reserved/invalid/unknown`。
- 所有新表加 GRANT + RLS（admin 写、authenticated 读）。

### 阶段 2 — 服务层抽象（不改 UI）
在 `src/lib/services/` 下建立可替换服务接口：
- `domain-generator.service.ts`（基于规则 + 可选 Lovable AI）
- `domain-availability.service.ts`（封装现有 RDAP，统一返回结构）
- `registrar-price.service.ts`
- `coupon.service.ts`
- `registrar-provider.service.ts`（Provider 接口 + Spaceship 实现 + Mock 默认）
- 统一 `DomainCheckResult` 类型。
- 密钥使用 `SECRET_ENCRYPTION_KEY`（generate_secret）+ AES-GCM 加密；前端只回显 `sk_****abcd`。

### 阶段 3 — 域名灵感页 `/ideas`
- 表单：关键词、行业、用途、语言、长度、后缀偏好。
- 调用 Lovable AI（gemini-3-flash）+ 规则混合生成 5–30 个候选。
- 卡片展示：理由 / 用途 / 记忆度 / 品牌感 / 长度 / 后缀 / 是否建议购买。
- 操作：复制、加入检测队列（跳 /discover 预填）、加入 watchlist。

### 阶段 4 — 检测流增强
- `/check` 新增轻量批量检测页（文本框 + 多后缀 fan-out + 进度 + 导出），复用现有 RDAP/jobs。
- 状态枚举对齐 available/taken/premium/reserved/invalid/unknown。
- 单域名检测后弹出"购买建议"组件：推荐注册商、价格、优惠码、风险提示、跳转购买链接（不自动购买）。

### 阶段 5 — 价格对比 `/prices`
- 表格 + 卡片，支持按 TLD 筛选与多维排序。
- 显示价格更新时间，明确标"非实时"。
- 后台 `/admin/prices` 增删改 `registrar_prices`。

### 阶段 6 — 优惠码 `/coupons` + `/admin/coupons`
- 前台：按注册商/TLD 筛选有效优惠码；过期自动灰显。
- 后台：CRUD + verified 标记。

### 阶段 7 — 注册商 API 管理 `/admin/registrars`
- 扩展现有 admin 页：API Key/Secret 加密保存、脱敏显示、测试连接按钮、启用/禁用。
- Spaceship Provider：availability / list / DNS / nameserver / autorenew（注册与修改 DNS 预留 + 二次确认）。
- 其他注册商（Namecheap/Porkbun/Dynadot/Cloudflare/NameSilo/GoDaddy）通过同一 Provider 接口扩展，初期为 stub。

### 阶段 8 — Dashboard 升级
- 在现有首页加：我的域名数、关注数、即将到期、最近检测、推荐关注、API 状态、今日检测次数 8 个卡片。

### 阶段 9 — 验证
- typecheck / build / 关键路由 smoke（/, /ideas, /check, /prices, /coupons, /watchlist, /my-domains, /admin/*）。
- 移动端断点 review。

## 安全
- 密钥 AES-GCM 加密入库；前端永不回显完整密钥。
- 所有写操作走 `requireSupabaseAuth` + `has_role('admin')`。
- 危险操作（注册/改 DNS/删配置）二次确认弹窗。
- 不实现自动购买；购买按钮仅 deep-link 到注册商。

## 兼容性承诺
- 不删除现有路由 / 表 / 列；只做加列与新表。
- 不修改 auto-gen 文件。
- 现有 RDAP/Enrich/Watchlist/Admin 流程保持可用。

## 交付节奏建议
单回合做不完全部 9 个阶段。建议本回合先完成 **阶段 1–3（数据层 + 服务抽象 + 域名灵感页）**，作为最小可见增量，下一回合继续阶段 4 起。

请确认：
1. 是否同意按此阶段顺序推进、本回合先做阶段 1–3？
2. 域名灵感生成是否同意默认使用 Lovable AI（gemini-3-flash，已有 LOVABLE_API_KEY）？
3. 优惠码后台 CRUD 是否只限管理员？（默认是）
