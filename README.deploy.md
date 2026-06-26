# DomainHunter — 群晖 DS923+ 部署指南

本仓库已附带 `Dockerfile` 与 `docker-compose.yml`，可在 Synology DS923+（DSM 7.2+，Container Manager）一键部署。

> ⚠️ 说明：本仓库当前的代码仍依赖 Supabase（Lovable Cloud）作为认证与数据库后端，本次提交只完成了 **部署骨架（阶段 A）**。要在群晖上脱离 Lovable Cloud 完全自托管运行，还需要完成阶段 B（serverFn 迁移）与阶段 C（移除 Supabase 集成）。继续推进时会在同一仓库追加提交。
>
> 当前 docker-compose 已经能够：
> - 本地起一个 PostgreSQL 16 并自动执行 `db/init/*.sql` 建表；
> - 构建并运行前端容器（端口 3000）；
> - 通过 `.env` 注入所有运行时配置。

---

## 1. 准备群晖

1. DSM → **套件中心** 安装 **Container Manager**。
2. **控制面板 → 终端机和 SNMP** 启用 SSH（部署完后建议关闭）。
3. 用 SSH 登录 NAS：
   ```bash
   ssh <admin>@<NAS_LAN_IP>
   sudo -i
   ```
4. 选择一个目录存放项目，例如：
   ```bash
   mkdir -p /volume1/docker/domainhunter
   cd /volume1/docker/domainhunter
   ```

## 2. 获取代码

```bash
git clone https://github.com/<your-account>/<your-repo>.git .
```

或在 PC 上克隆后通过 File Station 上传到该目录。

## 3. 配置环境变量

```bash
cp .env.example .env
vi .env       # 修改 POSTGRES_PASSWORD / JWT_SECRET / AI_* 等
```

生成随机密钥的命令：

```bash
openssl rand -base64 24     # POSTGRES_PASSWORD
openssl rand -hex 32        # JWT_SECRET
```

## 4. 启动

```bash
docker compose up -d --build
docker compose logs -f app
```

首次启动会：
- 创建 `./data/pg`（Postgres 持久化数据，**记得纳入 NAS 备份**）；
- 执行 `db/init/01_schema.sql` 初始化所有业务表；
- 启动应用，监听 `0.0.0.0:3000`。

访问 `http://<NAS_LAN_IP>:3000` 即可。

## 5. 反向代理 + HTTPS（推荐）

DSM **控制面板 → 登录入口 → 高级 → 反向代理服务器 → 新增**：

| 字段 | 来源 | 目标 |
| --- | --- | --- |
| 协议 | HTTPS | HTTP |
| 主机名 | `dh.your-domain.com` | `localhost` |
| 端口 | `443` | `3000` |

在 **控制面板 → 安全性 → 证书** 申请 Let's Encrypt 证书并绑定该反代条目，即可通过 HTTPS 访问。

记得回到 `.env` 把 `APP_ORIGIN` 改为 `https://dh.your-domain.com` 并 `docker compose up -d` 重启。

## 6. 备份与升级

```bash
# 升级（拉取最新代码后）
docker compose pull && docker compose up -d --build

# 备份数据库
docker compose exec postgres pg_dump -U domainhunter domainhunter > backup-$(date +%F).sql

# 备份持久卷（关停后整体打包）
docker compose down
tar czf domainhunter-data-$(date +%F).tgz data/
docker compose up -d
```

## 7. 常见问题

- **5432 已被占用**：编辑 `docker-compose.yml`，注释掉 `postgres.ports` 整段（容器之间通过内部网络通信即可）。
- **应用启动失败 / Supabase 报错**：当前阶段代码仍调用 Lovable Cloud。要彻底脱离，请等待阶段 B/C 提交，或继续使用 Lovable 在线预览验证功能。
- **AI 灵感生成不可用**：在 `.env` 填 `AI_BASE_URL` + `AI_API_KEY` + `AI_MODEL`（任何 OpenAI 兼容服务，含本地 Ollama）。
