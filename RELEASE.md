# ExcaliDash v0.5.1

Release date: 2026-06-21

## Key changes

- Keep the backend SQLite-only and remove unused database-provider dependencies and configuration.
- Use Prisma's standard migration layout while preserving every existing SQLite migration name and checksum.
- Reduce Docker startup work by reusing the build-stage Prisma Client instead of regenerating it at runtime.
- Reduce the LocalDraw desktop runtime bundle by using Bun's built-in SQLite,
  pruning server-only routes, translations, and deprecated fonts, and enforcing
  payload-size budgets in the desktop build.

## Upgrading

<details>
<summary>Show upgrade steps</summary>

### Data safety checklist

- Back up the backend volume (`dev.db`, secrets, uploads, and S3 bucket data) before upgrading.
- Let migrations run on startup (`RUN_MIGRATIONS=true`) for normal deploys.
- If S3 is enabled, verify that existing object keys follow the canonical layout `{prefix}/{userId}/{drawingId}/{fileId}.{ext}`.
- Run `docker compose -f docker-compose.prod.yml logs backend --tail=200` after rollout and verify startup/migration status.

### Recommended upgrade (Docker Hub compose)

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

### Pin images to this release (recommended for reproducible deploys)

Edit `docker-compose.prod.yml` and pin the release tags:

```yaml
services:
  backend:
    image: zimengxiong/excalidash-backend:v0.5.1
  frontend:
    image: zimengxiong/excalidash-frontend:v0.5.1
```

Example:

```bash
docker compose -f docker-compose.prod.yml up -d
```

</details>
