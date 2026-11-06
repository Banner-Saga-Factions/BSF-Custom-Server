# Plan: the sign-in safety batch (#391, #375, #382, #385, #384)

> **Status**: Live. The wave plan for these five issues.
> **Issues**: #391, #375, #382 (Wave 1); BSF-Client #96 (Wave 1b); #385, #384 (Wave 2).
> **Last touched**: 2026-11-05

Five small problems in how the server signs players in. Two of them could put a player into the
wrong account; three are input checks that a modified game could trip. This plan records what was
found before any code was written, the decisions the owner made, and how the work is split.

Whether each issue is ready, blocked or done is on the
[BSF Roadmap board](https://github.com/orgs/Banner-Saga-Factions/projects/3), not here.

---

## Decisions (owner interview, 2026-11-03)

| Question | Decision |
|---|---|
| #391: what to answer when Steam cannot be asked | `409` with plain text. The owner checks the result in the real game. |
| #391: a Steam owner whose own Steam cannot be used | ~~A client warning on the Discord sign-in screen, in Wave 1.~~ **Replaced in the Wave 1 chat (2026-11-03):** at every launch the game lets the player choose Steam or Discord, with an option to remember the choice; a player may keep one account of each. Its own BSF-Client issue and wave (Wave 1b). Why: the game cannot tell "Steam not installed" from "Steam closed", so a warning could not keep away from players with no Steam, and the game's dialog holds two buttons at most. |
| #375: what is left to do | Put a ceiling on made-up numbers on the Steam route: **2,147,483,647**. No database change. |
| #382: a display name that is not text, or is too long | Ignore a name that is not text and sign in normally. Trim text, remove the "nul" character, cut to **32 characters**. Read it before any session is made. |
| #385: how Continue knows the value is the server's own | The server remembers each value it hands out (one use, timed out), and refuses a request that sends the cookie twice. |
| Waves | Wave 1: #391, #375, #382, all on the Steam sign-in route. Wave 1b (added 2026-11-03): the client's Steam-or-Discord choice. Wave 2: #385, #384. |
| Release pressure | None. No client release carrying the Discord sign-in is planned. |

## What was found before planning

### #391: the game's reaction to a `409` on a Steam sign-in

Read from the patched client in `BSF-Client/src/` (commit `47d76aa`). The client cannot be compiled
in the planning session, so nothing here was seen running.

1. **The request layer does not send it again.** A request is re-sent only on `0`, `404` or `500`
   and above (`HttpAction.as` → `canRetry`, line 363), and the sign-in does not ask to be re-sent at
   all (`client-contract.md` → R10).
2. **It does not send the player to Discord.** That happens only on `401` or `400`
   (`AuthState.as` → `isRefusedSteamSignIn`, line 146).
3. **It is not treated as a hard failure either.** On a first Steam sign-in the "must succeed"
   flag (`AUTH_REQUIRE`) is off, so `AuthState` stores the server's text as the message and marks its step **completed**
   (lines 121–131). The game then moves on to the account-information step with no session key
   (`GameFsm.as`, line 138).
4. **What follows depends on the game's run mode.** [Inference, read from the code in the Wave 1
   review, 2026-11-05] Launch options such as `--factions` or `--developer` set the run mode, the
   last one winning; with none, as from the installer's shortcut, it is BETA (`GameMainAir.as`).
   - FACTIONS: the game goes straight on to the town, where the shipped `FactionsState.as` finds
     no session, marks the sign-in "must succeed" and starts it again. The second `409` fails the
     step, and a "Login failed" dialog shows the server's text, with Retry and Disconnect. That
     matches the two asks measured for a `401` on 2026-10-12 (`client-contract.md` → *A refused
     sign-in*).
   - BETA and DEVELOPER: the game goes on to the main menu. The second ask and the dialog come
     only when the player clicks Combat (`MainMenuPage.as` → `combatClickHandler`).

   The second ask carries a fresh Steam proof, so it is a new ask, not a re-send. A `409` needs a
   real Steam proof: a `--steam_id` launch sends a stand-in, which for a Steam number gets `401`
   and opens the Discord sign-in.

So a `409` meets "not treated as a refusal" by reading the code. **Owner decision 2026-11-05:** the
one further ask, followed by the dialog, meets #391's "not re-sent"; owner check 2 confirms it in
the real game.

**A second road to the same empty account.** [Inference, from the client code] When the
*player's own* Steam cannot be used (it will not start, or gives no proof), the patched game goes
straight to the Discord sign-in without asking the server (`StartState.as`; `PreAuthState.as` →
`startDiscordSignIn`), so the `409` never comes into play. Whether Steam hands out a proof while
it is offline is [Unverified]. The owner first added a warning on the Discord sign-in screen to
#391's acceptance criteria for this case, then replaced it with a choice of Steam or Discord at
launch (BSF-Client #96; see *Decisions*).

### #375: the provider is already recorded

#379 (merged, commit `b05d6a9`) stores, beside every player number, which sign-in route owns it
(`account_numbers.provider`). The other route is refused that id before any session is touched
(`auth.ts`, the `ownedBy` check after `accountNumberFor`). So nobody can open another player's
account by this route any more.

What is left is a **lockout**, described in `docs/security.md`: a Discord account made before
about August 2015 has an id below the start of the Steam range, so it can arrive on the Steam
route as a "made-up" number with no proof. Whoever signs in with it first owns it. If that is
someone on the Steam route, the real Discord player is refused from then on.

**The chosen fix.** Refuse made-up numbers above 2,147,483,647 on the Steam route (answer `400`).

- [Inference] Every Discord id is far above that. A Discord id is the account's creation time in
  milliseconds since 1 January 2015, shifted up by 22 binary places, so any account made 512 ms or
  more after that moment has an id above 2,147,483,647. #375 asked for this to be confirmed with one
  real early Discord id. None was to hand, so the owner closed that step on Discord's documented id
  format instead (2026-11-05); the tests use ids built from dates.
- 2,147,483,647 is already the largest in-game number the game can hold. A made-up number above it
  today is quietly given some other number (`accountNumberSeed.ts` → `CLAIM_ACCOUNT_NUMBER_SQL`).
- It changes nothing already stored. An early Discord id that was filed under Steam before this
  change stays there; the #379 count found none.
- **Players affected:** anyone who already signed in with a made-up number above the ceiling would
  be refused afterwards, and the patched game would offer them the Discord sign-in. The owner runs
  the count in *Owner checks* before Wave 1 merges.
- This does not meet #375's acceptance criteria as written, which ask for separate keys per
  provider. Wave 1 updates the issue to say why the ceiling was chosen instead.

### #382 and #384

As the issues describe. One addition for #382: "32 characters" is counted in whole characters,
not in the units JavaScript's `length` counts, so an emoji is never cut in half. Steam's own limit
being 32 is [Unverified].

### #385

As the issue describes. The file already has the pattern to copy: `pendingStates` in
`discord.ts` (remembered, one use, timed out, and capped in size).

## Waves

Both server waves branch with `--no-track`: Wave 1 from commit `66f9354`, the first to carry this
plan, and Wave 2 from `main` once Wave 1 has merged, otherwise from `66f9354` too. They touch
different files (Wave 1: `auth.ts`, `accountId.ts`; Wave 2: `discord.ts`, `app.ts`), so neither
needs to build on the other. Both touch sign-in, so both get the highest review tier: the checker
and the refuter, through the `bsf-review` skill, before any pull request opens. No pull request
opens until the owner asks.

### Wave 1: #391, #375, #382, the Steam sign-in route

1. **#391.** In `steamSignInRefusal`, answer `409` with plain text for `unreachable` and
   `key-rejected`; `refused` stays `401`. Tests for each verdict. Update `docs/error-handling.md`
   and `docs/client-contract.md` to say which answer means what.
1a. ~~#391, client side: a warning on the Discord sign-in screen.~~ Moved out of Wave 1 on
   2026-11-03 and replaced by Wave 1b below.
2. **#375.** Refuse a made-up number above 2,147,483,647 on the Steam route with `400`, in the
   same place the "too big" check sits (`steamRouteIdKind`). A test shows that an early Discord
   player's id cannot be claimed on the Steam route, and that a made-up number at the ceiling
   still signs in. Update `docs/security.md`.
3. **#382.** Read `display_name` before `addSession`: text only, trimmed, nul removed, cut to 32
   characters. A test sends `{"toString": "x"}` and checks that the sign-in succeeds and replaces
   the existing session as usual.

### Wave 1b: choose Steam or Discord at launch (BSF-Client)

At every launch the game lets the player choose to sign in with Steam or with Discord, with an
option to remember the choice. Its own issue,
[BSF-Client #96](https://github.com/Banner-Saga-Factions/BSF-Client/issues/96), holds the acceptance
criteria, the open design points and the kickoff; the wave starts with a planning interview. Found while planning it:
the game's dialog box takes at most two buttons and has no tick box (`IGuiDialog`), and the game
already saves settings on the computer (`config.globalPrefs`), where a remembered choice can live.

### Wave 2: #385, #384

1. **#385.** Remember each Continue value the page hands out; Continue goes ahead only for a
   remembered value, once. Refuse a request whose cookie header carries `bsf_confirm` twice. Tests
   for the made-up pair and the doubled cookie; a normal page-then-Continue still signs in.
2. **#384.** `session_key` must be text and `account_id` a number or text; otherwise `400`. Tests
   for the three bodies in the issue.

## Owner checks

These need the owner's own machine or the production server.

1. **Before Wave 1 merges: how many made-up accounts sit above the ceiling.** Runs on the
   production server, in bash, from the folder holding the compose file, inside the app container.
   It reads the live database read-only, writes nothing, and prints one count and no ids, so the
   output is safe to paste.

   ```bash
   docker compose exec -T app node -e '
   const { DatabaseSync } = require("node:sqlite");
   const db = new DatabaseSync(process.env.DB_PATH, { readOnly: true });
   const row = db.prepare(`SELECT COUNT(*) AS n FROM account_numbers
     WHERE provider = ? AND (length(external_id) > 10 OR (length(external_id) = 10 AND external_id > ?))
       AND (length(external_id) < 17 OR (length(external_id) = 17 AND external_id < ?))`)
     .get("steam", "2147483647", "76561197960265728");
   console.log("made-up Steam-route numbers above the ceiling:", row.n);'
   ```

   The query compares the id text by length first, then by text. That works only if no stored id
   has leading zeros; #231 removed them at sign-in, but rows older than #231 are [Unverified].
2. **After Wave 1, on your PC: the game's reaction to the new `409`.** Run the patched client
   against a local server whose Steam check cannot get through (for example, a
   `STEAM_WEB_API_KEY` Steam rejects), with Steam running and signed in, and without `--steam_id`
   (step 4). Report: what the player sees, whether the game ever sends the sign-in again (watch
   the server log), and that it does not open the Discord sign-in. Expected from the code, from
   the installer's shortcut: one sign-in, then the main menu; clicking Combat makes a second
   sign-in, then "Login failed" showing the server's text, with Retry and Disconnect.
   `bsf-client/docs/driving-the-client.md`
   ([local](../../bsf-client/docs/driving-the-client.md) |
   [GitHub](https://github.com/Banner-Saga-Factions/BSF-Client/blob/master/docs/driving-the-client.md))
   covers launching it.
3. ~~After Wave 1, on your PC: the client warning.~~ Moved to Wave 1b, whose issue lists its own
   in-game checks.

## Kickoff prompts

Each one is meant to be pasted into a new chat. Copies go on #391 (Wave 1) and #385 (Wave 2).

### Wave 1

Used on 2026-11-03. That chat moved step 1a out to Wave 1b, and branched from `66f9354`.

```text
Wave 1 of the sign-in safety batch in BSF-Custom-Server: #391, #375 and #382, all on the
Steam sign-in route (bsf-server/src/services/auth/auth.ts and accountId.ts). Read
bsf-server/misc/Plan-Sign-In-Safety-Batch.md first: it holds the owner's decisions and what
was found before planning. Do not reopen those decisions.

Cloud container: run export PATH=/opt/node24/bin:$PATH first, then
cd bsf-server && yarn install --frozen-lockfile && yarn test (1,067 passing on 2026-11-03).
Branch off main with --no-track.

1. #391: answer 409 with plain text for "unreachable" and "key-rejected"; "refused" stays 401.
1a. #391, client side (BSF-Client, branch off master with --no-track): when Steam was there
   but could not be used, the Discord sign-in screen warns that signing in with Discord makes a
   separate account; a player with no Steam at all does not see it. StartState.as and
   PreAuthState.as note the path, DiscordSignIn.as shows the line; update
   docs/patch-inventory.md. The client cannot be compiled here: hand compile and in-game check
   to the owner.
2. #375: refuse made-up numbers above 2,147,483,647 on the Steam route with 400. Confirm the
   Discord id floor with one real early id. Add a comment to #375 saying why a ceiling was
   chosen instead of separate keys per provider.
3. #382: read display_name before the session is made; text only, trimmed, nul removed,
   32 whole characters at most; anything else is ignored.

Tests for each acceptance criterion. Update error-handling.md, client-contract.md and
security.md, plus a CHANGELOG entry. Sign-in is the highest review tier: run bsf-review
(checker plus refuter) before any pull request, and open none until the owner asks. Hand
the owner the three checks under "Owner checks" in the plan.
```

### Wave 2

```text
Wave 2 of the sign-in safety batch in BSF-Custom-Server: #385 (bsf-server/src/services/auth/
discord.ts) and #384 (bsf-server/src/app.ts, the test-only renown route). Read
bsf-server/misc/Plan-Sign-In-Safety-Batch.md first and do not reopen its decisions.

Cloud container: run export PATH=/opt/node24/bin:$PATH first, then
cd bsf-server && yarn install --frozen-lockfile && yarn test. Branch with --no-track off main
once Wave 1 has merged, otherwise off commit 66f9354 (main plus this plan); this wave does not
build on Wave 1.

1. #385: remember each Continue value the page hands out (one use, timed out, capped in size,
   like pendingStates). Continue goes ahead only for a remembered value. Refuse a request
   whose cookie header carries bsf_confirm twice.
2. #384: session_key must be text, and account_id a number or text; otherwise 400.

Tests for each acceptance criterion, then a CHANGELOG entry. #385 is sign-in, so run
bsf-review (checker plus refuter) before any pull request, and open none until the owner asks.
```
