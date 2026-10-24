# NEXORAO-VIP-back

Backend API for two independent e-commerce storefronts (NEXORA and HelpmeY) sharing a unified product catalog while isolating customer data, orders, invoices, and payments per store.

## Stack

- Runtime: Node.js 24 LTS
- Language: TypeScript 5.9 (strict, ESM)
- Framework: Express 5
- ORM: Prisma 7.10.1 (`@prisma/adapter-pg`)
- Database: PostgreSQL 17 (Neon)
- Testing: Vitest
- Linting: ESLint 10 + Prettier

## Architecture

Modular monolith:

- `src/lib/` — shared utilities (Prisma singleton, tenant context)
- `src/generated/prisma/` — Prisma Client (auto-generated, gitignored)
- `prisma/` — schema, seed, migrations
- `scripts/` — dev scripts (schema JSON, RLS test)
- `docs/` — design docs, audits, phase reports

## Multi-Tenant Design

One backend, two stores:

- **Shared**: product catalog, categories, suppliers, inventory
- **Isolated per store**: users, sessions, carts, orders, payments, invoices, refunds, shipments, supplier orders, financial transactions

Isolation enforced by **PostgreSQL Row-Level Security (RLS)**. Tenant-scoped queries run inside `withTenant(storeId, cb)` which sets `app.current_store_id` via `set_config()` before executing the callback.

## Status

- ✅ Express + Prisma 7 + adapter-pg
- ✅ Schema designed (33 models)
- ✅ Seed script written (not executed)
- ✅ Prisma Client singleton + `withTenant` helper
- ⏸️ Initial migration (pending — needs direct Neon endpoint)
- ⏸️ RLS policies (pending)
- ⏸️ Seed execution + isolation test (pending)

See `docs/10-phase-report.md` for detailed progress.

## Getting Started

```bash
pnpm install
cp .env.example .env   # fill in real Neon direct endpoint
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Health check: `GET /health`

## Scripts

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Dev server (tsx watch) |
| `pnpm build` | TypeScript compile |
| `pnpm start` | Run compiled server |
| `pnpm test` | Vitest |
| `pnpm lint` | ESLint (src/ + prisma/) |
| `pnpm db:generate` | Prisma generate |
| `pnpm db:migrate` | Prisma migrate |
| `pnpm db:seed` | Run seed |
| `pnpm db:studio` | Prisma Studio |
| `pnpm db:schema-json` | Regenerate docs/database-schema.json |

## Security

- `.env` gitignored, never committed
- Passwords hashed with argon2id
- Supplier tokens encrypted at rest (AES-256-GCM, planned)
- Tenant data isolated via RLS
- No secrets in logs or API responses
