# Battle simulation — where the rules actually run

**The server runs no combat simulation.** It is a thin **recorder and relay**: it forwards each player's moves to the other client, confirms kills by cross-client agreement, derives the winner, and does endgame bookkeeping (Elo, renown, KILLS). Every actual *rule* — turn order, move range and legality, targeting, the damage formula, ability resolution, even the per-turn lockstep hash — runs **client-side**, identically on both clients. This mirrors the original 2013 Stoic server, which was also a recorder, not a simulator.

Read this before you go looking for "the combat code" on the server — there isn't any. The pointers below are to where each rule actually lives.

- **Request/message lifecycle** → [`gameFlow.md`](./gameFlow.md)
- **Client-side engine** (FSM, board model, entity-ID contract, DJB hash) → `bsf-client/docs/battle-engine.md` ([local](../../bsf-client/docs/battle-engine.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/battle-engine.md))
- **Endgame flow + the `Battle` class** → [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- **Java-server parity** → [`protocol-cross-reference.md`](./protocol-cross-reference.md)
- **Threat model / trust boundary** → [`security.md`](./security.md)

## Why the server doesn't simulate

Both clients run the **identical compiled engine** and stay in step using a per-turn **DJB hash** — a short checksum computed over every entity's state. This design is called **lockstep**: as long as both sides begin from the same inputs and apply the same rules, they reach the same result with no referee in the middle. The server's only jobs are (a) to relay each side's moves to the other and (b) to be the trust anchor for the few facts a player could otherwise cheat on.

Re-implementing the whole combat engine on the server would create a *second* source of truth that must stay bit-identical with the client forever — precisely the maintenance trap lockstep exists to avoid. So it doesn't.

## What the server enforces vs. defers

**Enforced — server-authoritative:**

| Concern | How it's enforced | Source |
|---|---|---|
| Kill confirmation | A unit dies only when **both** clients report the same `entity` (#18) | `Battle.applyKillReport` (`Battle.ts:227`) |
| Winner | **Server-derived** — the side still holding units, *not* the client's `killerparty` (#19) | `Battle.ts:287` |
| Surrender on stall | A client past the per-turn deadline (crashed/disconnected) is surrendered | `finalizeSurrender` (`Battle.ts:589`); deadline `Battle.ts:194` |
| Request shape | `tiles` is an array, `turn` is a valid index, caller is a party in the battle | `/sync`, `/move`, `/action` guards (`Battle.ts:390,442,483`) |
| Elo rating | `calculateNewElo` at endgame | `ranking.ts` (called `Battle.ts:724`) |
| Renown | `computeRenownAwards` (see below) | `renownAwards.ts` (called `Battle.ts:745`) |
| KILLS stat credit | Both clients must name the **same** killer, or no unit is credited (#99) | `applyKillReport` |

**Deferred to the client — lockstep, never checked server-side:**

| Rule | Where it lives (client) |
|---|---|
| Turn order | `BattleTurnOrder` / `BattleBoard` |
| Move range & legality | `BattleEntity*` / board model |
| Targeting & ability resolution | `Op_*` effect ops |
| Damage formula | `BattleCalculationHelper` + `Op_Damage*` |
| Per-turn DJB lockstep hash | Computed and **compared client-side**. The server only relays each client's hash to the other — `/sync` forwards `req.body.hash` verbatim and stores `hash_str: null` (`Battle.ts:406-407`); it never compares them. |

The client-side classes above are documented in `battle-engine.md` (dual-linked at the top).

## Endgame bookkeeping — the server's real work

On the confirmed final kill (or a surrender), `endgame()` (`Battle.ts:662`) runs **once** — the `endgameStarted` flag makes a second, near-simultaneous "last unit died" message a no-op. It:

1. Computes each side's kills from the `aliveUnits` deltas.
2. Computes new **Elo** for both sides with `calculateNewElo` (`ranking.ts`). If *either* ranking row fails to load, both sides' Elo is left unchanged and the rest of endgame still runs.
3. Computes **renown** with `computeRenownAwards` (`renownAwards.ts`) — five additive bonuses ported from the original Stoic server:

   | Award | Value | When |
   |---|---|---|
   | WIN | 5 | Winner, always |
   | KILLS | 1 per enemy unit killed | Either side; the winner's is suppressed if the loser **surrendered** |
   | UNDERDOG | up to 4 | Winner, scaling with how much stronger the loser's party was |
   | EXPERT | 2 | Winner, for a win in ≤ 30 s |
   | STREAK | 1 | Winner already on a 2+ win streak, both parties power ≥ 6 |

   *(The flat `20 + kills × 3` is now only the `BSF_RENOWN_LEGACY_FORMULA=true` rollback.)*

4. Writes the ranking rows, the `battle` row, and (when a side's units scored kills) its roster row in one `Promise.all`, **then** pushes `BattleFinishedData` + `RenownMessage`. The messages go out only *after* the writes succeed, so a player never sees renown that wasn't actually saved.

`BattleFinishedData`'s wire shape is in [`dataStructures.md`](./dataStructures.md); the same flow is diagrammed in [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## The one genuinely server-side concern — the trust boundary

Because the server never sees the actual combat, the only cheats it can stop are the ones it can derive from **cross-client agreement**: a kill (both clients must report the same entity), the winner (the side still standing), and which unit earns KILLS credit (both must name the same killer).

The unclosable gap: **two *colluding* modified clients can still agree on a false outcome.** The server cannot tell without re-simulating the battle — which is exactly what lockstep avoids. This is the same trust boundary described in [`security.md`](./security.md) and [`.claude/rules/gotchas.md`](../.claude/rules/gotchas.md); it's a deliberate, documented limit, not a bug.

*Last updated: 2026-06-30*
