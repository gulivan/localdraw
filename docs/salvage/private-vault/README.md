# Private Vault — salvaged feature (unmerged)

Password-protected, client-side encrypted ("private") drawings. Originally built as
an alpha preview for issue #10 ("Support for Private / Locked Drawings", requested by
@schweppes-0x, closed COMPLETED on the strength of the alpha). It was **never merged**
into `main` — only shipped as docker tags `zimengxiong/excalidash-{backend,frontend}:0.1.7-dev-alpha-private-drawings`.

Original branch `10-feature-request-support-for-private-locked-drawings` (commit `4bc66ab`,
"MVP passwords") was deleted after this salvage. Recover the full original from that SHA
if still in the reflog / a clone.

## What was salvaged onto this branch (clean, no cruft)

New self-contained source, placed at its real paths:

- `frontend/src/utils/crypto.ts` — Web Crypto helpers (PBKDF2 key derivation, AES-256-GCM).
- `frontend/src/context/VaultContext.tsx` — unlock state / vault session.
- `frontend/src/components/PrivateVaultSetup.tsx`, `UnlockVaultModal.tsx`, `ChangeVaultPassword.tsx`.
- `frontend/src/pages/PrivateDrawings.tsx`.
- `frontend/src/types/index.ts` — added `isPrivate`/`encryptedData`/`iv` to `DrawingSummary`,
  plus `VaultStatus` / `VaultVerifyResult`.

Deliberately **dropped** from the original branch: committed `dev.db*` binaries and the
regenerated `backend/src/generated/client/*` (regenerate from schema instead).

## Not yet wired — remaining integration work

These edits in the original targeted the pre-refactor monolithic `backend/src/index.ts`
and old frontend, so they do **not** apply cleanly to current `main` and were left out.
Re-implement against current module layout:

- **Backend endpoints** (`index.ts` +352 in original): `/vault/*` setup/verify/change-password
  and `/drawings/:id/lock|unlock`. In current main these belong in `backend/src/routes/`
  modules, not `index.ts`.
- **Schema**: add to the `Drawing` model — `isPrivate Boolean @default(false)`,
  `encryptedData String?`, `iv String?` — and a `PrivateVault` singleton model
  (`passwordHash`, `salt`, `hint?`). Then **regenerate** the migration with
  `prisma migrate dev` against current `main` schema. Do NOT reuse
  `original-migration.sql` here — it recreates the `Drawing` table without main's
  `userId`/sharing columns and would drop data.
- **Frontend wiring**: routing in `App.tsx`, API calls in `api/index.ts`, and touch-ups
  to `Editor.tsx`, `Settings.tsx`, `Sidebar.tsx`, `Dashboard.tsx`, `DrawingCard.tsx`,
  `Layout.tsx`.
- **Multi-user**: original was pre-auth (single global vault). Current main has per-user
  auth — the vault should almost certainly be per-user now, not a singleton.

## Security caveat before shipping

The original server layer re-hashed the client hash with scrypt and stored
`passwordHash:salt` as a split string. Review this crypto design before shipping — the
scheme is ad hoc and predates the current auth system.

`original-migration.sql` is kept here for reference only.
