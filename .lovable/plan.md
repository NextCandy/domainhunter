# 域名批量查询工具复刻方案

## 技术架构
- **前端**：TanStack Start + Tailwind v4，现代化重设计（深色 + 单色精致排版）
- **后端**：Lovable Cloud (Supabase) 存储任务/结果；TanStack server functions 调用 RDAP/WHOIS
- **任务执行**：UI 触发批处理 server function（每批 N 个域名），客户端轮询进度。任务状态完全持久化，刷新页面/重新打开可继续

> Cloudflare Workers 无常驻进程，所以"关闭网页后台继续跑"用如下策略：任务状态在 DB；用户重新打开页面会自动恢复并继续推进。

## 数据库（Supabase）
- `jobs`：id, name, params(jsonb), status, totals(checked/available/registered/unsupported/errors), created_at
- `job_items`：id, job_id, domain, status(pending/available/registered/unsupported/error), info(jsonb), error
- `tlds_cache`：RDAP bootstrap 缓存

## 功能清单
1. **单域名查询卡片**：实时 RDAP，显示注册商/注册日/到期日/DNS/DNSSEC/来源
2. **新建任务表单**：
   - 域名格式：LLLL/LLL/NNNN/NNN/mixed3/自定义（L=字母 N=数字 A=字母数字 小写=固定）
   - 候选词/完整域名列表（带点直查）
   - 后缀来源：自定义/常用/全部 RDAP/全部 IANA 根区/按长度筛选
   - 过滤：开头/末尾/包含/正则；必须含字母/数字
   - QPS/并发/单主机 QPS/limit/max_total/超时/重试
   - 估算数量按钮
3. **任务面板**：实时进度（已查询/未注册/已注册/不支持/错误/速度），停止、补扫错误项
4. **下载**：available.txt / all_results.tsv / errors.txt（服务端导出）
5. **最近未注册/错误列表**：可一键复制
6. **数量参考表**

## RDAP 实现
- 启动时从 `https://data.iana.org/rdap/dns.json` 拉 bootstrap → 缓存
- 查询：根据 TLD 找 RDAP 服务器 → GET `/domain/{name}`
  - 404 → available
  - 200 → registered（解析 entities/dates/nameservers）
  - 无 RDAP → fallback 到 IANA WHOIS（HTTP gateway 或标记 unsupported）

## UI 设计
- 单一深色画布 `oklch(0.18 0.01 240)`，单色强调（电光青 `oklch(0.78 0.18 200)`）
- 显示字体 JetBrains Mono（终端感）+ 正文 Inter
- 卡片：1px 描边、无阴影、清晰分区
- 实时数字大字号、等宽

## 路由
- `/` 主页（所有功能在一页，对应原站）
- `/api/public/jobs/$id/download/$kind` 文件下载

## 实施顺序
1. 启用 Cloud + 创建数据库表
2. 设计系统 + 主页骨架 + 单域名查询
3. RDAP 服务端函数
4. 新建任务 + 候选词生成 + 持久化
5. 批处理引擎 + 进度面板
6. 下载端点 + 复制列表
