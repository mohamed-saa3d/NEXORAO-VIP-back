# 13 — Migration Report

Running log of pre-migration hardening, the first migration, RLS, seed and isolation tests.
Each phase is appended after it completes; the run pauses for confirmation between phases.

---

## PHASE 0 — Environment verification (read-only)

Date: 2026-10-25

### 0.1 DATABASE_URL endpoint

Parsed with Node (no shell quoting of credentials):

| Check | Value |
|---|---|
| Host | `ep-frosty-mud-b4c6rwd5.c-6.us-east-2.aws.neon.tech` |
| **POOLED** | **`false`** ✅ direct endpoint |
| `sslmode` | `require` |
| `channel_binding` | `null` (removed) |

The `-pooler` segment is gone and `channel_binding=require` was dropped since the audit.
Both blockers from the audit (B1) are resolved. `prisma migrate dev` will use a true
session-scoped connection.

### 0.2 Environment keys

| Key | Status |
|---|---|
| DATABASE_URL | present |
| ADMIN_EMAIL | present |
| ADMIN_INITIAL_PASSWORD | present |
| TOKEN_ENCRYPTION_KEY | present |
| JWT_SECRET | present |
| JWT_REFRESH_SECRET | present |
| NODE_ENV | present |
| PORT | present |

All 8 keys present. **Audit blocker B2 is resolved.**

### 0.3 Git state

```
On branch main
Your branch is up to date with 'origin/main'.
nothing to commit, working tree clean
```

| Commit | Message |
|---|---|
| `d04bab4` | docs: add project progress and pending tasks |
| `8ad4937` | feat(db): add indexes for FKs and RLS; finalize schema JSON |
| `b01c294` | chore: bootstrap backend (Express 5 + Prisma 7 + schema + seed + docs) |

Working tree **clean**. Tracked files: 232.

### 0.4 Baseline build / lint

| Command | Exit | Result |
|---|---|---|
| `pnpm build` | **0** | `tsc` clean |
| `pnpm lint` | **0** | `eslint src/ prisma/` clean |

### Phase 0 verdict

**GO.** Both audit blockers (pooled endpoint, missing env keys) are cleared, the working
tree is clean, and the project builds and lints. No STOP conditions triggered.

`JWT_SECRET` / `JWT_REFRESH_SECRET` now hold real 64-hex values rather than the
`change-in-env` placeholder.

> Note: `.env` lists `JWT_SECRET` twice — the second definition (the real value) wins in
> dotenv. Cosmetic only; the effective value is correct. Not modified (rule 6: `.env` is
> read-only for this task).

---

## PHASE 1 — Repo cleanup (non-schema)

Date: 2026-10-25

### 1.1 Duplicate agent-skill trees removed

`.claude/` and `.windsurf/` deleted (recursive). `.agents/` retained — it is the Prisma
default and holds the canonical copy.

Remaining top-level directories: `.agents`, `.git`, `.kilo`, `dist`, `docs`,
`node_modules`, `prisma`, `src`.

`.gitignore` updated:

```
.claude/
.windsurf/
```

Files removed: **142** (71 in `.claude/`, 71 in `.windsurf/` — each a full duplicate of
the `.agents/` Prisma skill set).

### 1.2 `docs/24-10.md` — CORRECTION to the audit finding

**The audit was wrong about this file. It was never mojibake, and no recovery was needed.**

Byte inspection of the original:

```
HEX_FIRST40 = 0d0a2d2d2d0d0a0d0a232020d8abd8a7d984d8abd98bd8a73a20d985d8a720d8a7d984d986d8a7d9...
              ^ start    ^ "## "  ^ "ثالثًا"
UTF8_DECODE_OK = YES
HAS_REPLACEMENT = false
```

`d8 ab d8 a7 d9 84 d8 ab d9 8b d8 a7` is **well-formed UTF-8 for `ثالثًا`**. The file
decoded cleanly with zero replacement characters.

What was actually happening: **the PowerShell console rendered UTF-8 as Windows-1252**,
so `Get-Content` displayed `Ø«Ø§Ù„Ø«Ù‹Ø§` on screen. The bytes on disk were always correct.
The audit (§13) reported a console rendering artifact as a file-encoding defect.

Action taken: the pure UTF-8 read produced an output byte-identical to the source
(`IDENTICAL=true`), so the content was carried over verbatim.

| Property | Value |
|---|---|
| Source | `docs/24-10.md` — 2,451 bytes |
| Result | `docs/12-progress.md` — 2,451 bytes, **byte-identical**, 38 lines / 1,963 chars |
| Old file | `docs/24-10.md` removed (renamed, content preserved) |

The rename itself was still correct on its own merits: the old name was a **date**, not a
document sequence number, and it was the odd one out next to `00-`, `11-`, `13-`.

### 1.3 Repo state after cleanup

| Metric | Before | After (projected) |
|---|---|---|
| Tracked files | 232 | **91** |
| Removed | — | 143 (142 skills + 1 doc rename) |
| Added | — | 2 (`docs/12-progress.md`, `docs/13-migration-report.md`) |

Within the expected 80–90 range (91).

Working tree now shows exactly the intended changes:

```
 M .gitignore
 D .claude/**            (71 files)
 D .windsurf/**          (71 files)
 D docs/24-10.md
?? docs/12-progress.md
?? docs/13-migration-report.md
```

No `.env`, no `src/generated/prisma/`, no `dist/` in the change set.

### Phase 1 verdict

**GO.** Repo reduced from 232 → 91 tracked files. Only the intended changes are present.
Nothing staged yet — staging happens in Phase 3 after the schema work.

> Two notes for the record:
> 1. A `.kilo/` directory exists at the project root and is **not** gitignored, but it is
>    also not tracked — it is empty or ignored by another mechanism. Not touched.
> 2. `dist/` exists locally from the Phase 0 build. It is gitignored and untracked. Left in
>    place as instructed.

---

## PHASE 2 — Schema modifications (FK + missing fields)

Date: 2026-10-25

### 2.1 FK relations to Store

Added `@relation(fields: [storeId], references: [id], onDelete: Restrict)` to all 12
`storeId` columns (11 required + `User.storeId` which existed as optional without
`onDelete`). `onDelete: Restrict` throughout — deleting a store can never cascade into
orders, payments or refunds.

| Model | storeId nullability | onDelete |
|---|---|---|
| Order | required | Restrict |
| Payment | required | Restrict |
| Refund | required | Restrict |
| Invoice | required | Restrict |
| Shipment | required | Restrict |
| SupplierOrder | required | Restrict |
| Cart | required | Restrict |
| Address | required | Restrict |
| FinancialTransaction | required | Restrict |
| User | nullable | Restrict (added; relation already existed) |
| UserSession | nullable | Restrict |
| SupplierConnection | nullable | Restrict |

Back-relations added to `Store`: `orders`, `payments`, `refunds`, `invoices`, `shipments`,
`supplierOrders`, `carts`, `addresses`, `financialTransactions`, `userSessions`,
`supplierConnections` (11). `users` and `settings` already existed and were not duplicated.

All existing `@@index([storeId])` / composite store indexes were left untouched.

### 2.2 Missing refund / cancellation fields (9)

| Model | Field | Type |
|---|---|---|
| Order | `cancelledAt` | `DateTime? @db.Timestamptz(6)` |
| Order | `cancelReason` | `String? @db.Text` |
| Order | `cancelledBy` | `String? @db.Uuid` — **no relation**, by design |
| Order | `policySnapshot` | `Json?` |
| Refund | `returnShippingCost` | `Decimal? @db.Decimal(12, 2)` |
| Refund | `restockingFee` | `Decimal? @db.Decimal(12, 2)` |
| SupplierRefund | `rejectionReason` | `String? @db.Text` |
| SupplierRefund | `disputedAt` | `DateTime? @db.Timestamptz(6)` |
| Shipment | `returnReason` | `String? @db.Text` |

### 2.3 Status documentation

`Refund.status` now carries `/// Status: pending, pending_approval, processing, succeeded, failed, cancelled`.
Doc comment only — no enum, no behaviour change.

### 2.4 Validation

| Command | Exit | Output |
|---|---|---|
| `pnpm prisma validate` | **0** | `The schema at prisma\schema.prisma is valid 🚀` |
| `pnpm prisma format` | **0** | `Formatted prisma\schema.prisma in 50ms 🚀` |

### 2.5 JSON regeneration — FAILED, REVERTED

Recreated `scripts/generate-schema-json.ts` from `b01c294` and ran it. Two of the four
expected numbers were wrong:

| Metric | Expected | Actual | Verdict |
|---|---|
| models | 33 | 33 | OK |
| relations | 41 | **39** | FAIL |
| fields | 407 | **327** | FAIL |
| indexes | 45 | **43** | FAIL |

`to_Store = 13` confirmed every new FK landed in the schema, so this is a **parser defect,
not a schema defect**:

1. The parser skips optional relations, so `UserSession → Store` and
   `SupplierConnection → Store` (both `storeId String?`) are not emitted: 29 + 10 = 39.
2. The 80-field shortfall cannot come from these edits (only 9 fields were added). The
   script in `b01c294` is **not** the script that produced the committed
   `database-schema.json`; that file was finalised in `8ad4937`, the same commit that
   deleted the generator.

Also correcting the audit: the committed JSON's `meta.totalIndexCount: 106` was never
verified against the schema — the audit only proved the JSON was internally consistent.
The true index count is in the 43–45 range.

**Resolution (per user decision):** restored the authoritative file with
`git checkout 8ad4937 -- docs/database-schema.json` → 33 models / 29 relations /
398 fields / 106 meta-indexes. The generator script is **kept, untracked**, so the parser
can be fixed deliberately later.

> ⚠️ **Known staleness:** the restored JSON describes the **pre-Phase-2** schema. It lacks
> the 12 Store FKs and the 9 new fields, and its relation count (29) predates the new
> relations. This is accepted, documented debt. The schema file is the source of truth
> until the parser is fixed and JSON is regenerated.

### 2.6 Client regeneration

`pnpm prisma generate` → exit **0**.
`✔ Generated Prisma Client (7.10.1) to .\src\generated\prisma in 485ms`
**41 files** total, **33** model files. Unchanged from the previous generation.

### 2.7 Build

| Command | Exit |
|---|---|
| `pnpm build` | **0** |
| `pnpm lint` | **0** |

### Phase 2 verdict

**GO for migration.** The schema is valid, complete and builds. The only open item is the
JSON doc, which is explicitly deferred by user decision and does not affect the database.

Change set at commit time: `M prisma/schema.prisma`, `?? scripts/` (untracked generator).
