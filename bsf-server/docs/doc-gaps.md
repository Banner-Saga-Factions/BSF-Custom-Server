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

## Tracked gaps

_None open._ All tracked documentation gaps — P1–P3, issues #74–#82 plus #48 — were filled across PRs #141, #143, and this P3 batch (2026-07-01). New gaps get added here following [Working with this file](#working-with-this-file) below.

---

## What is **not** in this list

Gaps that were considered and rejected — recorded here so they don't keep getting re-raised:

- **A protocol overview / "how the wire works" 101 doc.** Already covered by [`bsf-server/docs/ARCHITECTURE.md`](./ARCHITECTURE.md) → "Endpoint Transport Map" + [`protocol-cross-reference.md`](./protocol-cross-reference.md) + `bsf-client/docs/wire-protocol.md` ([local](../../bsf-client/docs/wire-protocol.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/wire-protocol.md)). The cross-link triad is sufficient.
- **CI / deployment guide.** [`bsf-server/docs/Deployment.md`](./Deployment.md) exists and is current.
- **A history / changelog page.** [`bsf-server/CHANGELOG.md`](../CHANGELOG.md) is the single source of truth; [`bsf-server/docs/HISTORY.md`](./HISTORY.md) covers older context.
- **API reference.** [`serverEndpoints.md`](./serverEndpoints.md) is comprehensive for request/response shapes.
- **Frontend / client docs.** Tracked separately under `bsf-client/docs/` ([local](../../bsf-client/docs/) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/tree/master/docs/)), including that suite's own gap list, `doc-gaps.md` ([local](../../bsf-client/docs/doc-gaps.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/doc-gaps.md)).

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
