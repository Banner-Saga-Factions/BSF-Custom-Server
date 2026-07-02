# `src/services/battle/` — Battle subsystem

Everything that happens once two players are matched: keeping track of the live
battle, passing each player's moves along to the other, confirming kills, and
wrapping up at the end (rating changes, renown rewards, and saving the result).
Importantly, the server does **not** run the fighting itself — both game clients
run the exact same battle logic step-for-step, and the server just relays
messages, records the outcome, and enforces a few things a cheating client could
otherwise fake. See [`battle-simulation.md`](../../../docs/battle-simulation.md)
for that boundary and
[`ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md#component-architecture) for the
subsystem overview.

| File | Role |
|---|---|
| `Battle.ts` | The `Battle` class, the list of live battles (`battleHandler`), every `/battle/*` route handler (deploy / sync / action / killed / exit / surrender), and `endgame()`. |
| `BattlePartyData.ts` | The data shape for one side's party as it's sent over the network — the ordered unit list (`defs[]`), `user`, `team`. |
| `BattleTurnData.ts` | The data shape for a single turn's move/action as it's passed between clients. |
| `ranking.ts` | The Elo rating math (`calculateNewElo`, `getEloKFactor`); ported from `BattleRanking.java`, matched exactly to the original server's rounding. |
| `renownAwards.ts` | `computeRenownAwards()` — the five renown bonuses (WIN / KILLS / UNDERDOG / EXPERT / STREAK). |
| `*.test.ts` | `Battle.test`, `Battle.killed.route.test`, `Battle.endgame.test`, `ranking.test`, `renownAwards.test`. |

**More detail:** [`gameFlow.md`](../../../docs/gameFlow.md) (lifecycle) · [`dataStructures.md`](../../../docs/dataStructures.md) (network shapes) · [`ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md#data-flow-full-battle-cycle) (full battle cycle).

**Gotchas** (full list in [`docs/FAQ.md`](../../../docs/FAQ.md) / [`.claude/rules/gotchas.md`](../../../.claude/rules/gotchas.md)):

- A death only counts once **both** clients report it; the winner is decided by the server (the side still holding units), never taken from the client's `killerparty`.
- Crediting a unit's KILLS stat also needs both clients to name the **same** killer.
- `endgameStarted` is a one-way switch — the first "last unit killed" or surrender finishes the battle; later ones are ignored.
- `BattleFinishedData.rewards[]` is ordered by **`party_index`**, not winner-first.
- The "you won / you lost" message is sent **only after** the end-of-battle database writes finish.
