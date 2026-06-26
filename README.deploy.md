# DomainHunter NAS Deployment Guide

This guide is the short operational version of the main [README.md](./README.md). Use it when deploying DomainHunter to Synology DSM, another NAS, or a shared Docker host.

## Safety model

- Use `docker-compose.nas.yml` on shared hosts.
- Expose only the app port to the host.
- Keep PostgreSQL on the Docker internal network.
- Do not reuse SSH ports as app ports.
- Do not stop or reconfigure unrelated containers to resolve conflicts.
- Never commit `.env`, database passwords, JWT secrets, SSH passwords, or GitHub tokens.

## Files

| File | Use |
| --- | --- |
| `Dockerfile` | Builds the app with Bun and runs it on Node 20 Alpine |
| `docker-compose.nas.yml` | Recommended NAS deployment; Postgres has no host port |
| `docker-compose.yml` | Generic example; publishes Postgres to loopback |
| `.env.example` | Runtime configuration template |
| `db/init/01_schema.sql` | PostgreSQL schema and seed data |

## Deploy on Synology / NAS

```bash
sudo -i
mkdir -p /volume1/docker/domainhunter
cd /volume1/docker/domainhunter
git clone https://github.com/NextCandy/domainhunter.git .
cp .env.example .env
mkdir -p data/pg
chmod 600 .env
vi .env
```

Set the required values:

```bash
POSTGRES_DB=domainhunter
POSTGRES_USER=domainhunter
POSTGRES_PASSWORD=<strong-random-password>
JWT_SECRET=<strong-random-hex-secret>
APP_PORT=8832
APP_ORIGIN=http://<NAS_IP>:8832
```

Generate secrets:

```bash
openssl rand -base64 32
openssl rand -hex 32
```

Validate and start:

```bash
docker compose -f docker-compose.nas.yml config
docker compose -f docker-compose.nas.yml up -d --build
```

## Port selection

Default app port:

```bash
APP_PORT=8832
APP_ORIGIN=http://<NAS_IP>:8832
```

If it is occupied, use the first available port from `8833`, `8834`, or `8835`, then update both `APP_PORT` and `APP_ORIGIN`.

Check before deploying:

```bash
ss -tulpn | grep -E ':8832|:8833|:8834|:8835|:3000|:5432' || true
docker ps --format 'table {{.Names}}\t{{.Ports}}\t{{.Status}}'
```

## Verify

```bash
docker compose -f docker-compose.nas.yml ps
docker logs --tail=100 domainhunter-app
docker logs --tail=100 domainhunter-postgres
curl -I http://127.0.0.1:${APP_PORT}
curl -I http://<NAS_IP>:${APP_PORT}
docker port domainhunter-postgres
```

Expected:

- `domainhunter-app` is healthy.
- `domainhunter-postgres` is healthy.
- The app URL returns HTTP `200`, `301`, `302`, `304`, or normal HTML.
- `docker port domainhunter-postgres` prints nothing with `docker-compose.nas.yml`.

## First login

The first registered account becomes the admin account. After logging in:

1. Open `Admin -> Registrars`.
2. Click the edit icon on an existing default registrar.
3. Update API Key, API Secret, enabled state, or buy-link template.
4. Save.

Default registrar names such as `Spaceship` are seeded by the database. They are editable; saving the same name updates the existing row rather than inserting a duplicate.

## Backup

```bash
docker compose -f docker-compose.nas.yml exec postgres pg_dump -U domainhunter domainhunter > backup-$(date +%F).sql
```

Cold data backup:

```bash
docker compose -f docker-compose.nas.yml down
tar czf domainhunter-data-$(date +%F).tgz data/
docker compose -f docker-compose.nas.yml up -d
```

## Upgrade

```bash
cd /volume1/docker/domainhunter
git pull
docker compose -f docker-compose.nas.yml up -d --build
```

## Troubleshooting

### Duplicate registrar name

If you see:

```text
duplicate key value violates unique constraint "registrars_name_key"
```

Update to the current code. The admin page now exposes edit controls for default registrars, and the server function updates an existing registrar by name when no row id is submitted.

### Bun lockfile error

If the build fails with `Unknown lockfile version`, use the current Dockerfile. It uses `oven/bun:1-alpine`, which supports the current `bun.lock` format.

### Vite CLI path error

If the build fails with:

```text
Cannot find module '../dist/node/cli.js' from '/app/node_modules/.bin/vite'
```

Use the current Dockerfile. It executes Vite directly:

```bash
bun ./node_modules/vite/bin/vite.js build
```

### Missing bind mount source

If Docker reports `Bind mount failed: ... data/pg does not exist`, create the directory:

```bash
mkdir -p data/pg
```

### TLD save JSON error

If saving the suffix/TLD list reports:

```text
invalid input syntax for type json
```

Update to the current code. The admin save path now serializes the TLD list before writing it to the JSONB `app_settings.value` column.

### App cannot be reached from LAN

Check:

```bash
docker compose -f docker-compose.nas.yml ps
curl -I http://127.0.0.1:${APP_PORT}
curl -I http://<NAS_IP>:${APP_PORT}
```

If localhost works but LAN access fails, open the selected app port in DSM/firewall settings. Do not change unrelated reverse proxies or Docker projects unless you intend to route through them.
