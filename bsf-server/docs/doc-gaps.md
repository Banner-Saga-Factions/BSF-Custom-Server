# Server documentation gaps

A tracked inventory of documentation gaps in `bsf-server/`. Each entry lists what's missing, what already exists that the author can draw on, where the new doc should live, and the GitHub issue it's tracked in.

This doc is the **human-readable index**. The actionable units are the linked issues — close issues when the gap is filled, not by editing this file.

## How this list was generated

By auditing `bsf-server/docs/`, `bsf-server/CONTRIBUTING.md`, `bsf-server/CHANGELOG.md`, `.claude/rules/`, and the `Development.md` / `gameFlow.md` / `dataStructures.md` files against the topics a new contributor or an LLM agent realistically needs answers to. Gaps were filtered to "actionable enough that the source material already exists somewhere" — pure wishlist items were dropped.

Companion to the client-side suite at [`bsf-client/docs/`](../../bsf-client/docs/).

## Priority legend

- **P1** — write next. Either a doc is marked WIP and abandoned, or the missing knowledge is required for current-milestone work (M1.5 / M2).
- **P2** — write after P1 is clear. Important for new contributors and for hardening, but not blocking work in flight.
- **P3** — nice to have. Mostly consolidation of existing tribal knowledge into a single discoverable place.

---

## P3 gaps

### 7. FAQ / troubleshooting

- **Current state.** Gotchas and FAQ-style notes are spread across at least three places: `bsf-server/CONTRIBUTING.md § Common Gotchas`, `.claude/rules/gotchas.md`, and `bsf-server/docs/Development.md § Key Gotchas`. There is duplication, drift, and no single place a new contributor lands.
- **Recommended location.** New `bsf-server/docs/FAQ.md`.
- **Scope.** Consolidate the three lists. Each entry: one-line problem statement → root cause → fix. Tag entries by area (DB, sessions, battle, deployment). Keep the existing source files as redirect stubs that link to the FAQ.
- **Source material.**
  - `bsf-server/CONTRIBUTING.md` § Common Gotchas.
  - `.claude/rules/gotchas.md`.
  - `bsf-server/docs/Development.md` § Key Gotchas.
- **Priority.** P3 — consolidation work; nothing is broken without it.
- **Tracking.** [#80](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/80)

### 8. Observability runbook

- **Current state.** Log-prefix conventions exist (`[BATTLE]`, `[MATCHMAKING]`, `[AUTH]`, `[QUEUE]`, etc. — visible in any console output) but there is no doc for them and no metrics / alerts / dashboards. The 2026-05-11 perf audit (commit `94d7eea`) identified an orphan-battle leak partly because nobody knew which log channel to grep.
- **Recommended location.** New `bsf-server/docs/observability.md`.
- **Scope.** Log-prefix conventions table (one row per prefix, with example lines and what to grep for). The (currently empty) metrics + alert section as a placeholder for future work. Runbooks for the three known degraded states: orphan battles, stuck queue, long-poll deadlock.
- **Source material.**
  - `bsf-server/src/` — grep for `console.log` prefixes.
  - `bsf-server/CHANGELOG.md` 2026-05-11 entries.
  - The perf audit memory (`project_perf_audit_2026_05_11.md`) — orphan-battle leak punch list.
- **Priority.** P3 — useful for ops; not blocking new features.
- **Tracking.** [#81](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/81)

### 9. Module READMEs under `src/services/`

- **Current state.** No `README.md` lives inside any subdirectory of `src/`. Module-level orientation (what's in `src/services/battle/` vs `src/services/queue/` vs `src/db/`) is implicit — readers infer it from file names.
- **Recommended location.** Three new files: `bsf-server/src/services/battle/README.md`, `bsf-server/src/services/queue/README.md`, `bsf-server/src/db/README.md`.
- **Scope.** Each README is ~30–50 lines. Per directory: a 2–3 sentence overview, a file-by-file table (`file | role`), pointers to the relevant `docs/` files for deeper material, gotchas specific to that module.
- **Source material.**
  - The directory contents themselves.
  - `bsf-server/docs/ARCHITECTURE.md` — already has per-module prose to seed from.
- **Priority.** P3 — small docs; mostly orientation aid for new contributors browsing the tree.
- **Tracking.** [#82](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues/82)

---

## What is **not** in this list

Gaps that were considered and rejected — recorded here so they don't keep getting re-raised:

- **A protocol overview / "how the wire works" 101 doc.** Already covered by [`bsf-server/docs/ARCHITECTURE.md`](./ARCHITECTURE.md) → "Endpoint Transport Map" + [`protocol-cross-reference.md`](./protocol-cross-reference.md) + [`bsf-client/docs/wire-protocol.md`](../../bsf-client/docs/wire-protocol.md). The cross-link triad is sufficient.
- **CI / deployment guide.** [`bsf-server/docs/Deployment.md`](./Deployment.md) exists and is current.
- **A history / changelog page.** [`bsf-server/CHANGELOG.md`](../CHANGELOG.md) is the single source of truth; [`bsf-server/docs/HISTORY.md`](./HISTORY.md) covers older context.
- **API reference.** [`serverEndpoints.md`](./serverEndpoints.md) is comprehensive for request/response shapes.
- **Frontend / client docs.** Tracked separately under [`bsf-client/docs/`](../../bsf-client/docs/).

---

## Working with this file

When you close a gap:

1. Land the new doc.
2. Edit this file to **remove** the entry (not strike-through it). Keep the table compact.
3. Comment + close the corresponding GitHub issue.

When you add a new gap:

1. Open a GitHub issue first (`gh issue create --label documentation --label P1/P2/P3`).
2. Add an entry to this file referencing the issue URL.
3. Source material citations are mandatory — if no existing artifact informs the gap, it's not actionable enough yet.
