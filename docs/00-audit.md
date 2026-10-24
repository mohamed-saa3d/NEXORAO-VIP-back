# 00 — Backend Audit (Pre-Schema) — Express

Date: 2026-10-24
Target project: `E:\Full_stack\NEXORAO-VIP-main\NEXORAO-back`
Status: **bootstrapped and building** — schema not yet applied (Step 2 pending)

## 1. Framework

**Express 5.3.0** (`^5.3.0`), TypeScript in strict mode, ESM (`"type": "module"`).

> **Decision change:** this project was first scaffolded with **NestJS 12**. That scaffold was
> discarded in favour of Express because the team is more familiar with it. No application code
> was lost — it was a greenfield directory. The NestJS tree (including its `node_modules`,
> `dist`, Prisma 7 stub, vitest/oxlint configs) is preserved at:
> `E:\Full_stack\NEXORAO-VIP-main\_backup_nestjs_20251023\`
> Nothing was deleted; recovery is possible at any time.

The NestJS generator also created agent-skill directories (`.claude/`, `.agents/`,
`.windsurf/`) and a `skills-lock.json` in the new tree — these come from **Prisma's
`init` command** (Prisma 7 automatically installs agent skills), not from a generator.

## 2. Runtime and toolchain

| Component | Version |
|---|---|
| Node.js | **v24.16.0** (matches the "Node 24 LTS" decision) |
| pnpm | **12.6.0** (project pins `packageManager: pnpm@12.15.0` via pnpm's `devEngines`) |
| git | 2.56.0.windows.3 |
| TypeScript | **~5.9.3** (strict: true) |
| Express | **5.3.0** |
| @types/express | 5.0.6 |
| @types/express-serve-static-core | 5.1.3 (explicit — see note in §6) |
| @types/node | 26.6.5 |

## 3. ORM — Prisma 7.10.1

`prisma` CLI and `@prisma/client` are both pinned to **7.10.1** (identical majors).

> Why pinned: npm's `latest` dist-tag for `prisma` currently resolves to
> **`8.0.0-rc.27`**, a release candidate, and an unpinned `pnpm add -D prisma` pulled
> `8.0.0-rc.26` against client `7.10.1` — a mismatched-major pair. 7.10.1 is the newest
> stable (`dist-tags.prev`). Do not unpin without checking `npm dist-tag ls prisma`.

### Prisma 7 structural notes (important for Step 2)

Prisma 7 changed how a project is configured. What `prisma init` generated:

- `prisma/schema.prisma`
  - `generator client { provider = "prisma-client"; output = "../src/generated/prisma" }`
  - `datasource db { provider = "postgresql" }` — **no `url` field**
- `prisma7.config.ts` — the datasource URL now lives here:
  `datasource: { url: process.env["DATABASE_URL"] }`, plus
  `migrations: { path: "prisma/migrations" }`. It does `import "dotenv/config"`.
- Generated client output is **`src/generated/prisma`** (inside `rootDir`), not
  `node_modules/.prisma`.
- `.gitignore` gained `/src/generated/prisma`.

**Blocking difference from the Step 2 schema text:** that schema declares
`provider = "prisma-client-js"` and `url = env("DATABASE_URL")` inside the `datasource`
block. Under Prisma 7 the generator is `prisma-client` with an explicit `output`, and the
`url` is supplied by `prisma7.config.ts`. The Step 2 schema will need those two blocks
adapted (model definitions stay verbatim).

## 4. Testing — Vitest 5.0.5

`vitest` + `@vitest/coverage-v8`, configured in `vitest.config.ts`
(node environment, globals on, includes `src/**/*.test.ts` and `tests/**/*.test.ts`).
Kept from the previous scaffold per instruction.

> **Note:** `pnpm test` currently exits 1 with *"No test files found"*. That is expected —
> no tests exist yet. It is not a broken configuration; the first test file will make it green.

## 5. Linting / formatting — ESLint + Prettier

Switched away from the NestJS-generated `oxlint` to **ESLint 10.13.0** flat config
(`eslint.config.js`, ESM) using `@eslint/js` + `typescript-eslint` 8.72.0, plus
**Prettier 3.9.10**. `pnpm lint` passes with zero findings.

> TypeScript is pinned to `~5.9.3` because `typescript-eslint@8.72.0` declares a peer range of
> `>=4.8.4 <6.1.0`. An unpinned `pnpm add -D typescript` installs **7.0.2**, which produces an
> unmet-peer error. `pnpm peers check` now reports: *No peer dependency issues found.*

## 6. Verified state (Step C)

| Check | Result |
|---|---|
| `pnpm build` | **passes**, exit 0 → `dist/main.js`, `dist/main.d.ts`, `dist/main.js.map` |
| `pnpm dev` (`tsx watch`) | **starts** — `Server running on http://localhost:3000` |
| `GET /health` | **200** → `{"status":"ok","timestamp":"2026-10-24T00:21:39.010Z"}` |
| `pnpm lint` | **passes**, exit 0 |
| `pnpm test` | exits 1 — *No test files found* (expected) |

**TS2742 encountered and fixed:** with `declaration: true`, `export { app }` failed with
*"The inferred type of 'app' cannot be named without a reference to
`.pnpm/@types+express-serve-static-core@5.1.3/...`"*. Cause: pnpm does not hoist transitive
types, so `@types/express-serve-static-core` was unreachable as a top-level module. Fix was to
add it as an explicit devDependency — **no application code was changed**.

## 7. Files

```
NEXORAO-back/
├── src/main.ts              # Express 5 bootstrap, /health, PORT from env
├── prisma/schema.prisma     # Prisma 7 stub — replaced in Step 2
├── prisma7.config.ts        # Prisma 7 config: schema path, migrations, datasource URL
├── eslint.config.js         # ESLint 10 flat config (ESM)
├── vitest.config.ts         # Vitest 5 (node env, globals)
├── tsconfig.json            # strict, NodeNext, ES2022, outDir dist, rootDir src
├── package.json             # type: module, scripts (dev/build/start/test/db:*/lint/format)
├── pnpm-workspace.yaml      # allowBuilds: @prisma/engines, esbuild, prisma
├── pnpm-lock.yaml
├── .env                     # placeholder values — gitignored
├── .env.example             # DATABASE_URL, ADMIN_EMAIL, ADMIN_INITIAL_PASSWORD,
│                            # TOKEN_ENCRYPTION_KEY, JWT_SECRET, JWT_REFRESH_SECRET,
│                            # NODE_ENV, PORT
├── .gitignore               # node_modules/, dist/, .env, .env.*, !.env.example,
│                            # /src/generated/prisma, *.log, .DS_Store
├── skills-lock.json  .claude/  .agents/  .windsurf/   # created by Prisma 7 init
└── dist/                    # build output (gitignored)
```

## 8. Environment caveat — global pnpm is broken

The machine's global pnpm install (`%APPDATA%\npm\node_modules\pnpm`) is version 12.6.0 but its
`.cmd`/`.ps1` shims point at a malformed path and print nothing. Workaround in use: a shim at
`%LOCALAPPDATA%\nexora-bin\pnpm.cmd` prepended to PATH for the working session. A **fresh
terminal will not have working `pnpm`** until the global shim is repaired
(`npm install -g pnpm`) — flagged, not yet fixed, since it is outside the project.

## 9. Conflicts with the new schema

**None.** No tables, migrations, or `DATABASE_URL` point at a real database yet. The Prisma
migration baseline is empty.

### Caveats that survive from the first audit

1. **`gen_random_uuid()`** — native in PostgreSQL 13+; on PG ≤ 12 it needs the `pgcrypto`
   extension. The project targets **PostgreSQL 15+**, so this is satisfied.
2. **`StoreSettings.allowedLocales String[]`** — PostgreSQL-only array type; fine given
   `provider = "postgresql"`.
3. **`@@unique([supplierId, storeId])` on `SupplierConnection`** — PostgreSQL treats `NULL`s as
   distinct, so multiple global (`storeId = NULL`) connections per supplier are permitted.
   Business-rule note, not a schema error.
4. **`ADMIN_EMAIL` / `ADMIN_INITIAL_PASSWORD`** exist in `.env` as placeholders only. Real
   values must be supplied before the Step 3 seed can insert the super-admin.
5. **`db:seed` uses `tsx prisma/seed.ts`** — and `prisma7.config.ts` has no `seed` block yet.
   Add `migrations.seed: "tsx prisma/seed.ts"` (or `prisma.seed` equivalent) before running
   `prisma db seed`.

## 10. Verdict

Greenfield Express 5 + TypeScript (strict, ESM) application that builds, lints, and serves a
live `/health` endpoint. Prisma 7.10.1 is installed and initialized but has **no schema and no
migrations** — deliberately. Ready for `prisma/schema.prisma` (Step 2), subject to the Prisma 7
generator/datasource adaptation described in §3.

No `prisma migrate` or `db push` has been run, and none should be until Step 2 is approved.
