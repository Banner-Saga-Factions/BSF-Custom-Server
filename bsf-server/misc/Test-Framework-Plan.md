# Test Framework Plan

_Branch: `RichardElTaino-MVP_documentation-Phase1`_

---

## Current State

| What exists | What it covers |
|---|---|
| `yarn build` | TypeScript compiles clean — catches type errors only |
| `test-2p-match.bat` | Manual smoke test: login → queue → match → poll. Requires live server + DB |
| `launch-game-2p.ps1` | Manual full client test. Requires game client install |

No automated test suite exists. There are no unit tests, no route tests, no CI pipeline.

---

## Goals

1. Catch regressions before they reach `main` — specifically the class of bugs that have repeatedly appeared: unhandled async, broken DB writes, protocol shape mismatches, auth bypasses
2. Run in CI on every PR to `main` with no manual setup
3. Fast enough that developers actually run them locally before pushing (~30s for unit + integration, ~2min for full suite)
4. Not require a live game client — test the protocol layer from first principles

---

## Technology Choices

| Tool | Role | Why |
|---|---|---|
| **Vitest** | Test runner + assertions | Native TypeScript (no ts-jest config), Jest-compatible API, fast, good watch mode |
| **supertest** | HTTP layer tests | Tests Express routes without starting a real server |
| **vitest-mock-extended** | Type-safe DB mocking | Mocks `mysql2/promise` pool at the module boundary |
| **simple-git-hooks** | Pre-commit / pre-push hooks | Zero-dependency, no Husky overhead |
| **GitHub Actions** | CI | Native to the repo; MySQL service container built in |

---

## Test Categories

### 1. Unit Tests — `src/**/*.test.ts`

Pure logic, no network or DB. Fast (~1–2s total). Run on every save in watch mode.

**`src/db/account.test.ts`**
- `parseRow()` correctly parses JSON columns from raw MySQL result
- `parseRow()` handles pre-parsed JSON (non-string input) without double-parse
- `parseRow()` casts `user_id` to Number, `completed_tutorial` to Boolean

**`src/services/auth/auth.test.ts`**
- `getInitialData()` includes `first.json` data in return value (regression for `.concat()` bug)
- `getInitialData()` includes one queue entry per `GameMode` value
- `Session.asJson()` returns expected shape (has `session_key`, `user_id`, `build_number`, `display_name`)
- `sessionHandler.getSession("session_key", key)` finds correct session
- `sessionHandler.getSession("user_id", id)` finds correct session
- `sessionHandler.removeSession()` deletes session from store

**`src/services/queue.test.ts`**
- `matchmaking()` matches two players with identical `vs_type` and power
- `matchmaking()` does not match players with different power
- `matchmaking()` does not match players with different `vs_type`
- `matchmaking()` returns null when queue has only one player
- Power level computed correctly as sum of `(RANK - 1)` across party units

**`src/services/battle/Battle.test.ts`**
- `Battle` constructor populates `aliveUnits` for both parties
- `Battle` constructor keys `parties` by `session_key`
- `aliveUnits` contains correct unit IDs from party defs
- Renown calculation: winner gets `20 + kills × 3`, loser gets `kills × 3`
- `setReliableMessageData()` returns object with `reliable_msg_id`, `reliable_msg_target`, `timestamp`

**`src/const.test.ts`**
- `GameModes` enum contains expected values (`QUICK`, `RANKED`)
- `ServerClasses` values match protocol strings from Fiddler captures

---

### 2. Integration Tests — `test/routes/*.test.ts`

Express routes via `supertest`. DB is mocked at the `src/db/*` module boundary — no real MySQL needed.

**`test/routes/auth.test.ts`**
- `POST /services/auth/login/11` with valid `steam_id` returns `{ session_key, user_id, display_name, build_number }`
- `POST /services/auth/login/11` with invalid/missing `steam_id` returns 4xx, not 500
- `POST /services/auth/logout/:session_key` removes session; subsequent requests return 403
- Any request to `/services/*` without valid session key returns 403
- Any request to `/services/*` with valid session key passes through
- `GET /services/session/steam/overlay/*` returns 200 without auth (overlay bypass)
- Malformed Bearer token in `Authorization` header returns 403, not 500

**`test/routes/game.test.ts`**
- `GET /services/game/:session_key` with no pending data holds open up to 10s
- `GET /services/game/:session_key` returns immediately when `session.pushData()` is called
- `GET /services/game/:session_key` returns `first.json` data + queue state on first poll
- Concurrent polls on the same session: second poll returns 409 or queues (no data theft)

**`test/routes/account.test.ts`**
- `GET /services/account/info/:session_key` returns correct shape with all required fields
- `GET /services/account/info/:session_key` includes `purchasable_units` from static `acc.json`
- `GET /services/account/info/:session_key` returns 401 when `accountData` is null
- `POST /services/account/update` with valid party saves party, updates session in memory
- `POST /services/account/update` with party IDs not in roster returns 400
- `POST /services/account/update` with party size > 6 returns 400
- `POST /services/account/update` with invalid roster def shape returns 400

**`test/routes/queue.test.ts`**
- `POST /services/vs/start/:session_key` adds player to queue, returns 200
- Two players with matching power trigger matchmaking — both receive `BattleCreateData`
- Two players with different power do not match
- Player already in queue: re-queue replaces old entry (no duplicate)
- `BattleCreateData` shape matches protocol spec (has `battle_id`, `parties[]`, `scene`, `friendly`)
- Each `BattlePartyData` in `parties` has `defs[]`, `user`, `session_key`, `party_index`

**`test/routes/battle.test.ts`**

_Setup: login two players, queue both, extract `battle_id` from `BattleCreateData`_

- `POST /services/battle/ready/:session_key` pushes `BattleReadyData` to opponent
- `POST /services/battle/deploy/:session_key` pushes `BattleDeployData` with tiles to opponent
- `POST /services/battle/sync/:session_key` stores action in `battle.turns[turn]`
- `POST /services/battle/query/:session_key` returns stored actions for given turn
- `POST /services/battle/move/:session_key` pushes `BattleMoveData` to opponent, stores in turns
- `POST /services/battle/action/:session_key` pushes `BattleActionData` to opponent, stores in turns
- `POST /services/battle/killed/:session_key` removes unit from `aliveUnits`
- `POST /services/battle/killed/:session_key` with last unit triggers endgame — both players receive `BattleFinishedData` + `RenownMessage`
- Endgame: winner renown = `20 + kills × 3`, loser renown = `kills × 3`
- Endgame: `saveBattleResult()` is called with correct `winner_user_id`, `loser_user_id`
- `POST /services/battle/surrender/:session_key` triggers endgame, surrendering player is loser
- `POST /services/battle/exit/:session_key` removes party from battle; battle cleaned up when both exit
- Battle route with unknown `battle_id` returns 404
- Battle route after opponent has disconnected: only `/exit` is allowed, others return 4xx

**`test/routes/discord.test.ts`**
- `GET /login/discord/oauth-callback` with valid code exchanges token, returns JWT
- `GET /login/discord/oauth-callback` with invalid code returns 4xx

---

### 3. DB Layer Tests — `test/db/*.test.ts`

Run against a real MySQL instance (local dev or CI container). Isolated schema, torn down after each test file.

**`test/db/account.test.ts`**
- `upsertAccount()` creates row on first call with default roster from `acc.json`
- `upsertAccount()` increments `login_count` on duplicate call, does not reset roster
- `getAccountByUserId()` returns `null` for unknown user
- `getAccountByUserId()` parses `roster_json` and `party_ids_json` from strings correctly
- `saveRoster()` persists roster, `getAccountByUserId()` returns updated value
- `saveParty()` persists party IDs, `getAccountByUserId()` returns updated value
- `addRenown()` adds positive delta, `addRenown()` subtracts negative delta
- Steam/Discord IDs > `MAX_SAFE_INTEGER` round-trip without precision loss (BigInt path)

**`test/db/battles.test.ts`**
- `saveBattleResult()` inserts new battle record
- `saveBattleResult()` with duplicate `battle_id` updates existing record (upsert)
- `saveBattleResult()` stores correct `winner_user_id`, `loser_user_id`, `renown_awarded`

---

### 4. Protocol Compliance Tests — `test/protocol/*.test.ts`

Cross-reference response shapes against known-good Fiddler captures in `data/game_captures/`. These catch protocol regressions the game client would reject silently.

**`test/protocol/shapes.test.ts`**
- Login response has: `session_key` (hex string, 16 chars), `user_id` (number), `display_name` (string), `build_number`
- `BattleCreateData` has: `class: "tbs.srv.battle.data.BattleCreateData"`, `battle_id`, `parties` (array, length 2), `scene: "greathall"`, `friendly: false`, `reliable_msg_id`, `timestamp`
- `BattlePartyData` has: `class`, `user` (number), `team` (string), `display_name`, `defs` (array), `elo`, `power`, `party_index` (0 or 1), `session_key`, `timer`
- `EntityDef` in defs has: `class: "tbs.srv.data.EntityDef"`, `id`, `entityClass`, `stats` (array), each stat has `class: "tbs.srv.data.Stat"`, `stat`, `value`
- `BattleFinishedData` has: `class`, `battle_id`, `victoriousTeam` (string of user_id), `total_renown`, `rewards` (array)
- `RenownMessage` has: `class: "tbs.srv.data.RenownMessage"`, `total` (number), `user_id`
- Account info response has: `roster.defs`, `party.ids`, `purchasable_units.units`, `renown`, `roster_rows`

---

## File Structure

```
BSF/
├── src/
│   ├── db/
│   │   ├── account.ts
│   │   └── account.test.ts          ← unit tests for parseRow(), pure logic
│   ├── services/
│   │   ├── auth/
│   │   │   └── auth.test.ts         ← unit tests for Session, sessionHandler
│   │   ├── battle/
│   │   │   └── Battle.test.ts       ← unit tests for Battle class
│   │   └── queue.test.ts            ← unit tests for matchmaking logic
│   └── const.test.ts
├── test/
│   ├── setup.ts                     ← shared supertest app setup, DB mock wiring
│   ├── helpers.ts                   ← login(), queueBoth(), createBattle() helpers
│   ├── routes/
│   │   ├── auth.test.ts
│   │   ├── game.test.ts
│   │   ├── account.test.ts
│   │   ├── queue.test.ts
│   │   ├── battle.test.ts
│   │   └── discord.test.ts
│   ├── db/
│   │   ├── account.test.ts
│   │   └── battles.test.ts
│   └── protocol/
│       └── shapes.test.ts
├── vitest.config.ts
├── vitest.config.db.ts              ← separate config for DB tests (longer timeout)
└── .github/
    └── workflows/
        └── ci.yml
```

---

## npm Scripts

Add to `package.json`:

```json
"scripts": {
  "dev": "ts-node-dev --respawn src/index.ts",
  "build": "tsc -p ./",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:db": "vitest run --config vitest.config.db.ts",
  "test:coverage": "vitest run --coverage",
  "test:ci": "vitest run --reporter=verbose --coverage"
}
```

`yarn test` — unit + route tests, no DB (fast, ~10–30s)  
`yarn test:db` — DB layer tests, requires MySQL (slower, ~30–60s)  
`yarn test:ci` — everything, used in GitHub Actions  

---

## `vitest.config.ts`

```ts
import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "test/routes/**/*.test.ts", "test/protocol/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    testTimeout: 15000, // long-poll tests need time
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
      thresholds: { lines: 70, functions: 70, branches: 60 },
    },
  },
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
});
```

---

## `vitest.config.db.ts`

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/db/**/*.test.ts"],
    testTimeout: 30000,
    pool: "forks",      // isolate each DB test file in its own process
    poolOptions: {
      forks: { singleFork: false },
    },
  },
});
```

---

## `test/setup.ts`

```ts
import { vi, beforeAll, afterAll } from "vitest";

// Mock the DB pool globally for route/unit tests — DB tests opt out via their own config
vi.mock("../src/db/connection", () => ({
  query: vi.fn().mockResolvedValue({ affectedRows: 1 }),
  queryOne: vi.fn().mockResolvedValue(null),
}));

// Suppress console noise during tests
beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "debug").mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
});
```

---

## `test/helpers.ts`

Shared test utilities to avoid boilerplate in every route test:

```ts
import request from "supertest";
import app from "../src/app"; // app needs to be exported separately from server listen

export async function loginPlayer(steam_id: string) {
  const res = await request(app)
    .post("/services/auth/login/11")
    .send({ steam_id });
  return res.body.session_key as string;
}

export async function queuePlayer(session_key: string, power = 0) {
  await request(app)
    .post(`/services/vs/start/${session_key}`)
    .send({ vs_type: "QUICK", match_handle: 1 });
}

export async function pollForClass(session_key: string, cls: string) {
  const res = await request(app).get(`/services/game/${session_key}`);
  return (res.body as any[]).find((item: any) => item.class === cls);
}
```

> **Note:** This requires extracting the Express `app` from `http.createServer()` in `src/index.ts` into a separate `src/app.ts`. This is a 5-line refactor and is required for supertest to work.

---

## Required Refactor: Extract `app` from `index.ts`

Currently `src/index.ts` creates and starts the server in one file. Supertest needs the `app` object without starting a listening server. Split into:

**`src/app.ts`** — creates and exports `app`, registers all middleware and routes  
**`src/index.ts`** — imports `app`, calls `http.createServer(app).listen(8082)`

This is a mechanical change (~15 lines moved) with no behavior change.

---

## Pre-Commit Hooks

Install `simple-git-hooks`:
```bash
yarn add -D simple-git-hooks
```

Add to `package.json`:
```json
"simple-git-hooks": {
  "pre-commit": "yarn build",
  "pre-push": "yarn test"
},
"scripts": {
  "prepare": "simple-git-hooks"
}
```

Run `yarn prepare` once to install the hooks.

**Pre-commit:** `yarn build` — TypeScript compile check (~5s). Blocks commits with type errors.  
**Pre-push:** `yarn test` — full unit + route test suite (~30s). Blocks pushes with failing tests.

DB tests are excluded from the pre-push hook — they require MySQL and are covered by CI instead.

---

## GitHub Actions CI Workflow

**`.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: ["**"]
  pull_request:
    branches: [main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest

    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ROOT_PASSWORD: testpassword
          MYSQL_DATABASE: bsf_test
        ports:
          - 3306:3306
        options: >-
          --health-cmd="mysqladmin ping"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=5

    strategy:
      matrix:
        node-version: [18.x, 20.x]

    steps:
      - uses: actions/checkout@v4

      - name: Use Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: "yarn"

      - name: Install dependencies
        run: yarn install --frozen-lockfile

      - name: TypeScript compile check
        run: yarn build

      - name: Init test database
        run: |
          mysql -h 127.0.0.1 -u root -ptestpassword bsf_test < src/db/schema.sql

      - name: Run unit + route tests
        run: yarn test:ci
        env:
          JWT_SECRET: test-secret-do-not-use-in-prod
          NODE_ENV: test

      - name: Run DB layer tests
        run: yarn test:db
        env:
          DB_HOST: 127.0.0.1
          DB_PORT: 3306
          DB_USER: root
          DB_PASSWORD: testpassword
          DB_NAME: bsf_test
          JWT_SECRET: test-secret-do-not-use-in-prod
          NODE_ENV: test

      - name: Upload coverage
        if: matrix.node-version == '20.x'
        uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/
```

---

## Coverage Targets

Initial targets (pragmatic for a codebase with no prior tests):

| Layer | Target | Priority |
|---|---|---|
| `src/db/account.ts` | 90% | High — money path, precision bugs live here |
| `src/db/battles.ts` | 90% | High |
| `src/services/battle/Battle.ts` | 80% | High — endgame/aliveUnits bugs |
| `src/services/queue.ts` | 80% | High — matchmaking logic |
| `src/services/auth/auth.ts` | 75% | High — session/JWT |
| `src/services/account.ts` | 75% | Medium |
| `src/services/game.ts` | 60% | Medium — long-poll hard to unit test |
| Overall | 70% lines | Enforced in vitest config |

---

## Implementation Order

Do these in sequence — each step ships independently and improves coverage immediately.

| Step | What | Effort |
|------|------|--------|
| **1** | Extract `app.ts` from `index.ts` | 30 min |
| **2** | Install Vitest + supertest, add `vitest.config.ts`, wire `yarn test` | 1 hr |
| **3** | Unit tests: `Battle.test.ts`, `auth.test.ts`, `queue.test.ts` | 2–3 hr |
| **4** | Route tests: `auth`, `account`, `queue` | 2–3 hr |
| **5** | Route tests: `battle` (most complex — full lifecycle) | 3–4 hr |
| **6** | Protocol shape tests against Fiddler captures | 1–2 hr |
| **7** | DB layer tests + CI `vitest.config.db.ts` | 2 hr |
| **8** | GitHub Actions workflow | 1 hr |
| **9** | `simple-git-hooks` pre-commit/pre-push | 30 min |

Total: approximately 2–3 streams to reach full coverage.

---

## Notes

- **Long-poll tests** (`game.test.ts`) need careful handling — supertest doesn't support streaming. Test by calling `session.pushData()` via a parallel Promise immediately after opening the poll, then asserting the response resolves with the pushed data within the timeout.
- **`first.json` caching** — `getInitialData()` reads the file at module load. Tests that need to control initial data should mock `fs.readFileSync` or use `vi.resetModules()` between cases.
- **DB tests are stateful** — each test file should run `schema.sql` in a `beforeAll` and `DROP TABLE` (or `TRUNCATE`) in `afterAll` or `afterEach` to keep tests independent.
- **The `test-2p-match.bat` smoke test** stays as-is for manual pre-release verification. It is not replaced by this framework — it tests the full server + DB stack on a real build, which automated tests cannot fully replicate.

---

*Created with [Claude Code](https://claude.ai/code)*
