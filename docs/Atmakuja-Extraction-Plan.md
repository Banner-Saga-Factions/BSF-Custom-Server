# Extraction Plan: `Atmakuja_DB_Changes` → `RichardElTaino-MVP_documentation-Phase1`

_Based on regression analysis of PR #10. See `docs/Regression Analysis Report.md` for full findings._

---

## Summary

PR #10 (`Atmakuja_DB_Changes`) cannot be merged as-is — it regresses 27 commits of working code and introduces 7 critical bugs. However, two pieces of work have genuine value and should be adapted onto the current branch:

| Item | Description | Effort |
|------|-------------|--------|
| 1 | **RosterRouter** — 7 Proving Grounds routes rewritten against current DB stack | Medium (~1–2 streams) |
| 2 | **Normalized schema** — filed as a future milestone, not implemented now | Low (doc only) |

> **Note:** Item 3 (surrender stub) was already shipped in commit `2b2a7c9`. No action needed.

---

## Item 1: RosterRouter

### What it is

A new `src/services/roster.ts` file mounted at `/roster` in `index.ts`, providing the Proving Grounds feature set: party arrangement, unit promotion/rename/retire/hire, stat upgrades, and barracks expansion.

Atmakuja's implementation is used as a **route/logic reference only**. All DB calls must be rewritten against the current `mysql2/promise` stack (`src/db/account.ts`).

---

### How the current stack maps to each route

The current schema stores the full roster as a JSON blob (`roster_json`) and the party as a JSON array (`party_ids_json`) in the `accounts` table. All mutations follow the same pattern:

1. Read from `session.accountData` (in-memory cache — source of truth for the session)
2. Mutate the in-memory array
3. Write back to DB via `saveRoster()` / `saveParty()` / `addRenown()`
4. Update `session.accountData` to match

Available DB helpers in `src/db/account.ts`:

| Helper | Signature | Use |
|--------|-----------|-----|
| `saveRoster` | `(user_id, roster_defs[])` | Persist mutated roster |
| `saveParty` | `(user_id, party_ids[])` | Persist mutated party |
| `addRenown` | `(user_id, delta: number)` | Add or subtract renown (pass negative to spend) |
| `getAccountByUserId` | `(user_id)` | Re-fetch if needed |

One new helper is needed (see below).

---

### Route-by-route plan

#### `POST /roster/party/arrange/:session_key`
**What it does:** Replaces the player's active party with a new ordered list.

**Request body:** `{ party: string[] }` — array of unit IDs

**Implementation:**
```ts
// Validate IDs exist in current roster
const validIds = new Set(acc.roster_json.map((u: any) => u.id));
const invalid = party.filter((id: string) => !validIds.has(id));
if (invalid.length > 0) return res.status(400).json({ error: "unknown unit IDs", ids: invalid });
if (party.length > 6) return res.sendStatus(400);

await saveParty(session.user_id, party);
acc.party_ids_json = party;
res.send();
```

**Notes:** The existing `/account/update` validation logic is directly reusable here. Consider deduplicating into a shared helper.

---

#### `POST /roster/unit/promote/:session_key`
**What it does:** Ranks up a unit by 1, optionally renames it and changes its class, deducts renown.

**Request body:** `{ unit_id: string, name: string, class_id: string }`

**Renown costs:** Rank 1→2 = 20 | Rank 2→3 = 80 | Rank 3+ = 160

**Implementation:**
```ts
const unit = acc.roster_json.find((u: any) => u.id === unit_id);
if (!unit) return res.sendStatus(404);

const rankStat = unit.stats.find((s: any) => s.stat === "RANK");
if (!rankStat) return res.sendStatus(400);

const cost = rankStat.value === 1 ? 20 : rankStat.value === 2 ? 80 : 160;
if (acc.renown < cost) return res.status(402).json({ error: "insufficient renown" });

rankStat.value += 1;
unit.name = name;
unit.entityClass = class_id;

await saveRoster(session.user_id, acc.roster_json);
await addRenown(session.user_id, -cost);
acc.renown -= cost;
res.send();
```

---

#### `POST /roster/unit/rename/:session_key`
**What it does:** Renames a unit. Costs 10 renown.

**Request body:** `{ unit_id: string, name: string }`

**Implementation:**
```ts
if (!name || !unit_id) return res.sendStatus(400);
if (acc.renown < 10) return res.status(402).json({ error: "insufficient renown" });

const unit = acc.roster_json.find((u: any) => u.id === unit_id);
if (!unit) return res.sendStatus(404);

unit.name = name;
await saveRoster(session.user_id, acc.roster_json);
await addRenown(session.user_id, -10);
acc.renown -= 10;
res.send();
```

---

#### `POST /roster/unit/retire/:session_key`
**What it does:** Permanently removes a unit from the roster. Also removes it from the party if present.

**Request body:** `{ unit_id: string }`

**Implementation:**
```ts
const idx = acc.roster_json.findIndex((u: any) => u.id === unit_id);
if (idx === -1) return res.sendStatus(404);

acc.roster_json.splice(idx, 1);
const partyChanged = acc.party_ids_json.includes(unit_id);
if (partyChanged) acc.party_ids_json = acc.party_ids_json.filter((id) => id !== unit_id);

await saveRoster(session.user_id, acc.roster_json);
if (partyChanged) await saveParty(session.user_id, acc.party_ids_json);
res.send();
```

---

#### `POST /roster/unit/hire/:session_key`
**What it does:** Purchases a unit from the Mead House (static purchasable units list), adds it to the roster.

**Request body:** `{ purchasable_unit_id: string, new_unit_id: string, new_unit_name: string }`

**Implementation:**
```ts
// PURCHASABLE_UNITS is already loaded from data/acc.json in account.ts — expose or re-use it
const template = PURCHASABLE_UNITS.units.find((u: any) => u.def.id === purchasable_unit_id);
if (!template) return res.sendStatus(404);
if (acc.renown < template.cost) return res.status(402).json({ error: "insufficient renown" });
if (acc.roster_json.length >= acc.roster_rows) return res.status(400).json({ error: "barracks full" });

// Generate a unique unit ID if the client sends a bare class name (e.g. "archer" → "archer_start_0")
let finalId = new_unit_id;
if (!finalId.includes("_start_")) {
    const prefix = finalId.split("_")[0] + "_start_";
    const existing = acc.roster_json.filter((u: any) => u.id.startsWith(prefix));
    finalId = prefix + existing.length;
}

const newUnit = { ...template.def, id: finalId, name: new_unit_name };
acc.roster_json.push(newUnit);

await saveRoster(session.user_id, acc.roster_json);
await addRenown(session.user_id, -template.cost);
acc.renown -= template.cost;
res.send();
```

**Note:** `PURCHASABLE_UNITS` is currently a module-level constant in `account.ts`. Either export it or load it again in `roster.ts`. Prefer exporting to avoid double file reads.

---

#### `POST /roster/unit/stats/purchase/:session_key`
**What it does:** Applies stat upgrades to a unit.

**Request body:** `{ unit_id: string, stats: string[], deltas: number[] }`

**Implementation:**
```ts
const unit = acc.roster_json.find((u: any) => u.id === unit_id);
if (!unit) return res.sendStatus(404);

// Validate and apply each delta
for (let i = 0; i < stats.length; i++) {
    const stat = unit.stats.find((s: any) => s.stat === stats[i]);
    if (!stat) return res.status(400).json({ error: `unknown stat: ${stats[i]}` });
    // Bounds check: deltas must be positive, stat value must not exceed game max
    if (typeof deltas[i] !== "number" || deltas[i] <= 0 || deltas[i] > 5) {
        return res.status(400).json({ error: `invalid delta for ${stats[i]}` });
    }
    stat.value += deltas[i];
}

await saveRoster(session.user_id, acc.roster_json);
res.send();
```

**Known limitation:** The renown cost for stat upgrades is not currently documented in server-accessible game data — the client computes and displays it client-side. For MVP, accept client deltas with server-side bounds validation (delta 1–5 per stat, no negative). Document as a known gap; a future stream can add a server-side cost table.

---

#### `POST /roster/unlock/:session_key`
**What it does:** Expands the barracks by 1 slot. Costs 60 renown.

**Request body:** none

**New DB helper required** — add to `src/db/account.ts`:
```ts
export async function expandBarracks(user_id: number | string): Promise<void> {
    await query(
        "UPDATE accounts SET roster_rows = roster_rows + 1, renown = renown - 60 WHERE user_id = ?",
        [String(user_id)]
    );
}
```

**Route implementation:**
```ts
if (acc.renown < 60) return res.status(402).json({ error: "insufficient renown" });

await expandBarracks(session.user_id);
acc.roster_rows += 1;
acc.renown -= 60;
res.send();
```

---

### Wiring into `index.ts`

```ts
import { RosterRouter } from "./services/roster";
// ...
ServiceRouter.use("/roster", RosterRouter);
```

---

### Validation patterns to apply consistently

These were missing from Atmakuja's implementation and must be included:

- **Renown check:** `if (acc.renown < cost) return res.status(402).json({ error: "insufficient renown" });` — before every spend
- **Unit existence check:** `const unit = acc.roster_json.find(...)` + `if (!unit) return res.sendStatus(404);`
- **Barracks capacity:** `if (acc.roster_json.length >= acc.roster_rows)` before hire
- **try/catch on all DB writes** — return 500 on failure, don't leave client hanging
- **In-memory sync:** always update `session.accountData` after every DB write

---

### What to review before merging

- Confirm client request body shapes against Fiddler captures in `data/game_captures/` — especially `unit/hire` and `unit/stats/purchase`, which have the most complex payloads
- Confirm stat names (`RANK`, `STRENGTH`, `ARMOR`, etc.) match exactly what the client sends
- Test party/roster in-memory state persists correctly across a full session (login → arrange party → battle → /account/info)
- Confirm `roster_rows` limit is enforced correctly on hire

---

## Item 2: Normalized Schema (Future Milestone)

### What it is

A future DB schema redesign replacing the current JSON-blob columns with proper relational tables. **Not for this branch** — document only.

### Why it matters

The current `roster_json` / `party_ids_json` blobs work for MVP but have limits:

- SQL can't query individual units or stats (no `WHERE stat = 'RANK'`)
- Stat upgrades require reading the whole roster, mutating in memory, and writing the whole blob
- No referential integrity between units and parties
- Reporting and leaderboards can't filter by unit class or rank

### Proposed schema

```sql
CREATE TABLE entity_defs (
    id          INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT UNSIGNED NOT NULL,
    unit_id     VARCHAR(64)     NOT NULL,       -- e.g. "archer_start_0"
    entity_class VARCHAR(32)    NOT NULL,       -- e.g. "archer"
    name        VARCHAR(64)     NOT NULL,
    appearance_acquires INT NOT NULL DEFAULT 0,
    appearance_index    INT NOT NULL DEFAULT 0,
    UNIQUE KEY uq_user_unit (user_id, unit_id),
    FOREIGN KEY (user_id) REFERENCES accounts(user_id)
);

CREATE TABLE entity_stats (
    id              INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    entity_def_id   INT UNSIGNED    NOT NULL,
    stat            VARCHAR(32)     NOT NULL,   -- e.g. "RANK", "STRENGTH"
    value           INT             NOT NULL,
    UNIQUE KEY uq_def_stat (entity_def_id, stat),
    FOREIGN KEY (entity_def_id) REFERENCES entity_defs(id) ON DELETE CASCADE
);

CREATE TABLE party_members (
    user_id     BIGINT UNSIGNED NOT NULL,
    unit_id     VARCHAR(64)     NOT NULL,
    slot        TINYINT         NOT NULL,       -- 0-5, ordering
    PRIMARY KEY (user_id, slot),
    FOREIGN KEY (user_id) REFERENCES accounts(user_id)
);
```

### Migration path

1. Add new tables alongside existing `accounts` columns (non-breaking)
2. Write a migration script to populate `entity_defs` / `entity_stats` / `party_members` from existing `roster_json` / `party_ids_json`
3. Update `src/db/account.ts` — new helpers reading from normalized tables, keeping JSON blobs in sync during transition
4. Cut over entirely: remove JSON blob columns once normalized tables are validated in prod
5. Rewrite `RosterRouter` stat purchase to use row-level updates instead of full blob rewrite

### Prerequisites

- RosterRouter (Item 1) must be complete and tested with the JSON-blob approach first
- Requires a migration script and a tested rollback path before touching production data
- Estimate: 2–3 streams minimum

---

## Appendix: What Was Already Done

| Item | Status | Commit |
|------|--------|--------|
| `/battle/surrender` stub | ✅ Shipped | `2b2a7c9` |
| Steam ID precision loss fix | ✅ Shipped | `8c01347` |
| Discord OAuth login | ✅ Shipped | `dd68d4c` |
| Endgame protocol compliance | ✅ Shipped | `2b2a7c9` |
