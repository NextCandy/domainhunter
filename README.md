# DomainHunter

DomainHunter is a self-hostable domain discovery and pricing dashboard built with TanStack Start, Vite, React, TypeScript, Bun, Nitro, and PostgreSQL.

It can search and enrich domain ideas, track watchlists and owned domains, compare registrar pricing, and configure registrar API credentials from an admin interface. The Docker setup is designed to run on a NAS such as Synology DSM while keeping the database private to the Docker network.

## Features

- Domain discovery, batch checks, RDAP/WHOIS-style enrichment, archive and SEO enrichment hooks.
- Watchlist and owned-domain tracking.
- Registrar price and coupon tables.
- Admin pages for TLDs, sources, scoring, registrar credentials, settings, users, jobs, and history.
- PostgreSQL 16 schema bootstrap from `db/init/01_schema.sql`.
- Docker production image using Bun for build and Node 20 Alpine for runtime.
- NAS-safe Compose file that exposes only the web app port.

## Repository layout

| Path | Purpose |
| --- | --- |
| `src/` | TanStack Start application and server functions |
| `src/routes/admin.registrars.tsx` | Admin UI for registrar credential and buy-link management |
| `src/lib/discover.functions.ts` | Server functions for discovery/admin data, including registrar upsert logic |
| `db/init/01_schema.sql` | PostgreSQL bootstrap schema and default registrar seed data |
| `Dockerfile` | Multi-stage production build |
| `docker-compose.yml` | Generic local/Synology Compose example |
| `docker-compose.nas.yml` | NAS-safe Compose file, with Postgres internal-only |
| `.env.example` | Runtime configuration template |

## Requirements

- Docker Engine with Docker Compose v2.
- A host that can build Linux containers.
- At least one free TCP port for the app, default `8832` for NAS deployment.
- Optional API keys for AI, SEMrush, and Google OAuth.

## Environment variables

Copy `.env.example` to `.env` and set at least:

```bash
POSTGRES_DB=domainhunter
POSTGRES_USER=domainhunter
POSTGRES_PASSWORD=<strong-random-password>
JWT_SECRET=<strong-random-hex-secret>
APP_ORIGIN=http://<host-or-nas-ip>:8832
APP_PORT=8832
```

Generate safe local secrets:

```bash
openssl rand -base64 32
openssl rand -hex 32
```

Leave these empty unless you have matching services configured:

```bash
AI_BASE_URL=
AI_API_KEY=
AI_MODEL=gpt-4o-mini
SEMRUSH_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Do not commit `.env`, generated database passwords, JWT secrets, SSH passwords, or GitHub tokens.

## Synology / NAS deployment

Use `docker-compose.nas.yml` on a shared NAS to avoid collisions with other projects.

```bash
mkdir -p /volume1/docker/domainhunter
cd /volume1/docker/domainhunter
git clone https://github.com/NextCandy/domainhunter.git .
cp .env.example .env
mkdir -p data/pg
chmod 600 .env
vi .env
docker compose -f docker-compose.nas.yml config
docker compose -f docker-compose.nas.yml up -d --build
```

Recommended NAS values:

```bash
APP_PORT=8832
APP_ORIGIN=http://<NAS_IP>:8832
```

If `8832` is already used, choose another free host port such as `8833`, `8834`, or `8835`, then update both `APP_PORT` and `APP_ORIGIN`.

### Port policy

- App container listens on internal port `3000`.
- Host access is controlled by `APP_PORT`, default `8832`.
- PostgreSQL listens only inside the Docker network in `docker-compose.nas.yml`.
- Do not reuse an SSH port as the app port.
- Do not stop or reconfigure unrelated NAS containers to free ports.

Check ports before starting:

```bash
ss -tulpn | grep -E ':8832|:8833|:8834|:8835|:3000|:5432' || true
docker ps --format 'table {{.Names}}\t{{.Ports}}\t{{.Status}}'
```

## Generic Docker deployment

For a local development host where binding Postgres to loopback is acceptable:

```bash
cp .env.example .env
docker compose up -d --build
```

For production or shared hosts, prefer:

```bash
docker compose -f docker-compose.nas.yml up -d --build
```

## Admin workflow

The first registered user becomes the administrator through the database trigger in `db/init/01_schema.sql`.

After logging in as admin:

1. Open `Admin -> Registrars`.
2. Click the edit icon on a default registrar such as Spaceship.
3. Enter API Key and API Secret if the registrar integration requires them.
4. Update the buy-link template if the default template is not suitable.
5. Save.

Default registrar rows are seeded by the database. They are editable. Saving `Spaceship` without selecting an existing row also updates the existing `Spaceship` row instead of trying to insert a duplicate.

## Registrar credential behavior

The current implementation stores API Key and API Secret through `pseudoEncrypt`, which is base64 obfuscation, not real encryption. This is acceptable only as a placeholder for private/self-hosted testing.

For production, replace this with KMS, Vault, SOPS, or another real secret-management mechanism before storing valuable registrar credentials.

## Build notes

The production image uses:

- `oven/bun:1-alpine` for dependency install and Vite/Nitro build.
- `node:20-alpine` for runtime.
- `NITRO_PRESET=node-server`.

The Dockerfile invokes Vite directly with:

```bash
bun ./node_modules/vite/bin/vite.js build
```

This avoids Bun `.bin` shim path issues seen on some Alpine/Synology builds.

## Verification commands

```bash
docker compose -f docker-compose.nas.yml ps
docker logs --tail=100 domainhunter-app
docker logs --tail=100 domainhunter-postgres
curl -I http://127.0.0.1:${APP_PORT}
curl -I http://<NAS_IP>:${APP_PORT}
docker port domainhunter-postgres
```

Expected:

- `domainhunter-app` is `healthy`.
- `domainhunter-postgres` is `healthy`.
- `curl` returns `200`, `301`, `302`, `304`, or normal HTML.
- `docker port domainhunter-postgres` prints nothing when using `docker-compose.nas.yml`.

## Backup and upgrade

Back up the database:

```bash
docker compose -f docker-compose.nas.yml exec postgres pg_dump -U domainhunter domainhunter > backup-$(date +%F).sql
```

Upgrade:

```bash
git pull
docker compose -f docker-compose.nas.yml up -d --build
```

Cold backup of persistent data:

```bash
docker compose -f docker-compose.nas.yml down
tar czf domainhunter-data-$(date +%F).tgz data/
docker compose -f docker-compose.nas.yml up -d
```

## Troubleshooting

### `duplicate key value violates unique constraint "registrars_name_key"`

This means a registrar with that name already exists. The admin UI now lets you edit default registrar rows directly, and the server update path updates an existing registrar by name when no `id` is submitted.

### `Unknown lockfile version` during Docker build

Use the current Dockerfile with `oven/bun:1-alpine`. Older Bun images may not understand the current `bun.lock` format.

### `Cannot find module '../dist/node/cli.js' from node_modules/.bin/vite`

Use the current Dockerfile. It calls Vite directly instead of relying on the Bun-generated `.bin` shim.

### `Bind mount failed: data/pg does not exist`

Create the host data directory before starting:

```bash
mkdir -p data/pg
```

### Port conflict

Do not stop unrelated containers. Choose a new app port:

```bash
APP_PORT=8833
APP_ORIGIN=http://<NAS_IP>:8833
```

Then restart:

```bash
docker compose -f docker-compose.nas.yml up -d
```
