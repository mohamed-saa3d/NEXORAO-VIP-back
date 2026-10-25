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
