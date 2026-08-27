import { Session, sessionHandler } from "./auth/auth";
import { ServerClasses, GameModes, REPORTED_QUEUE_MODES } from "../const";
import { battleHandler } from "./battle/Battle";
import { getOrCreateRanking } from "../db/ranking";
import { buildOrderedPartyDefs } from "./account";
import { asyncRouter } from "../http/asyncRouter";

// ---------------------------------------------------------------------------
// Matchmaker constants — ported from tbs.srv.worker.VsWorker (Java reference
// at %USERPROFILE%\Code\bsf-refs\server-2013-java\src\main\java\tbs\srv\worker\
// VsWorker.java). See bsf-server/misc/Plan-Integrate-Original-Stoic-Server.md
// milestone M2 for the porting plan.
// ---------------------------------------------------------------------------

function envInt(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw === undefined || raw === "") return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`${name} must be a positive number (got "${raw}")`);
    }
    return n;
}

// Plan-named env-var knobs (the three M2 calls out explicitly):
const VS_WINDOW_POWER_TIME_SECS = envInt("VS_WINDOW_POWER_TIME_SECS", 20);
const VS_BRACKET_ELO = envInt("VS_BRACKET_ELO", 200);
const VS_BRACKET_POWER = envInt("VS_BRACKET_POWER", 4);

// Instant rollback flag — same pattern as BSF_RENOWN_LEGACY_FORMULA in
// renownAwards.ts:42 (read at call time so tests can toggle without
// reloading the module). When true the matchmaker reverts to the pre-M2
// exact-power scan and the 5-second pump becomes a no-op.
const isLegacyMode = (): boolean => process.env.BSF_MATCHMAKER_LEGACY === "true";

// Internal tuning constants — match Java VsWorkerConfig defaults. Not exposed
// as env vars because in 2013 Stoic rarely touched them.
const VS_CHECK_MS = 5_000;
const VS_WINDOW_POWER_MIN = 0;
const VS_WINDOW_POWER_MAX = 4;
const VS_WINDOW_ELO_MIN = 4;
const VS_WINDOW_ELO_MAX = 4000;
const VS_WINDOW_ELO_TIME_SECS = 1000;
const VS_QUICK_ELO_DIFF = 50;

// Per-mode behavior — matches tbs.srv.util.VsType.java constructor args
// (equalPower, eloWindow). RANKED/TOURNEY require an exact power match;
// QUICK uses the widening power window.
//
// FRIEND copies QUICK here, exactly as VsType.java does. In practice these settings
// barely matter for it: two people who named each other are paired on that basis
// alone, before any of the power/rating windows below are consulted.
const MODE_CONFIG: Record<GameModes, { equalPower: boolean; eloWindow: boolean }> = {
    [GameModes.QUICK]:   { equalPower: false, eloWindow: false },
    [GameModes.RANKED]:  { equalPower: true,  eloWindow: true  },
    [GameModes.TOURNEY]: { equalPower: true,  eloWindow: true  },
    [GameModes.FRIEND]:  { equalPower: false, eloWindow: false },
};

// ---------------------------------------------------------------------------
// Pure helpers (no I/O, no shared mutable state). Each mirrors a specific
// piece of VsWorker.java math byte-for-byte. Tests in matchmaker.test.ts
// drive these with table-driven cases.
// ---------------------------------------------------------------------------

/**
 * Linear-ramp threshold growth. Ported from VsWorker.java:226-240.
 *   now = min + trunc(range * elapsed / duration), clamped to max.
 * A negative `cur` means "infinite, don't grow" and returns unchanged.
 * Use Math.trunc to match Java's (int) cast (truncates toward zero), not
 * Math.floor — same rule already enforced in M1 ranking.ts.
 */
export function bumpThreshold(
    elapsedMs: number,
    cur: number,
    min: number,
    max: number,
    durationMs: number,
): number {
    if (cur < 0) return cur;
    const range = max - min;
    return Math.min(max, min + Math.trunc((range * elapsedMs) / durationMs));
}

// Views used by the window/scoring helpers. Defined as structural subsets of
// QueueItem so callers can pass a full QueueItem or a plain test object.
type WindowEntry = {
    type: GameModes;
    power: number;
    elo: number;
    threshold_power: number;
    threshold_elo: number;
};

type ScoringEntry = {
    type: GameModes;
    power: number;
    elo: number;
};

/**
 * Hard window check. Ported from VsWorker.java:851-865. Rejects if either
 * player's power-threshold is exceeded by the absolute power gap, or either
 * player's elo-threshold is exceeded by the absolute Elo gap. When either
 * side's elo is <= 0 (QUICK mode default), uses VS_QUICK_ELO_DIFF (50) as
 * the effective Elo difference — small enough that closely-rated QUICK
 * players still pair, large enough to deter mismatches via the threshold.
 */
export function checkWindows(a: WindowEntry, b: WindowEntry): boolean {
    const powerDiff = Math.abs(a.power - b.power);
    if (powerDiff > a.threshold_power || powerDiff > b.threshold_power) return false;

    const eloDiff = (a.elo > 0 && b.elo > 0) ? Math.abs(a.elo - b.elo) : VS_QUICK_ELO_DIFF;
    if (eloDiff > a.threshold_elo || eloDiff > b.threshold_elo) return false;

    return true;
}

/**
 * Composite signed match-quality score. Ported from
 * VsBestMatchComparator.compare (VsWorker.java:743-761).
 *   d = dElo + dPower (+ ±1 type-mismatch penalty)
 *   dElo   = MULT * (a.elo - b.elo) / VS_BRACKET_ELO     (0 if either elo <= 0)
 *   dPower = MULT * (a.power - b.power) / VS_BRACKET_POWER
 * Java's dTimer term is omitted: bsf-server doesn't track per-player turn
 * timer preference in the queue (BattlePartyData.timer is set from
 * party_index in Battle.ts:158, not from a user setting). With identical
 * timers in Java the term contributed 0, so this is a no-op simplification.
 * Caller takes Math.abs to pick the lowest-magnitude (closest) pairing.
 */
export function bestMatchScore(a: ScoringEntry, b: ScoringEntry): number {
    const MULT = 100;
    const useElo = a.elo > 0 && b.elo > 0;
    const dElo = useElo ? Math.trunc((MULT * (a.elo - b.elo)) / VS_BRACKET_ELO) : 0;
    const dPower = Math.trunc((MULT * (a.power - b.power)) / VS_BRACKET_POWER);
    let d = dElo + dPower;
    if (a.type !== b.type) {
        d += d > 0 ? 1 : -1;
    }
    return d;
}

/**
 * Whether two waiting players are allowed to be paired, required to be paired,
 * or must not be paired — decided purely on who each of them asked for.
 * Ported from VsWorker.checkForceMatch (VsWorker.java:769-800).
 *
 *   ALLOWED   neither asked for anybody in particular; judge them on power and
 *             rating as usual.
 *   REQUIRED  one asked for the other, and the other either asked back or has no
 *             preference. Pair them and skip the power/rating windows entirely —
 *             see the note in findBestMatch for why that skip is the whole point.
 *   FORBIDDEN at least one of them is holding out for somebody else.
 *
 * Deliberate divergence from the reference. The original's mirror-image branch
 * (VsWorker.java:787-796) tests the wrong side's field — its own comment says
 * "right wants left" but the code re-checks the LEFT one — so that branch can
 * never return REQUIRED and is dead. We implement the behaviour those comments
 * describe, in both directions. Nothing about the friend lobby depends on it,
 * because there both players name each other and the first branch fires either
 * way; it only means a one-sided request is answered on the spot instead of on
 * whichever later pass happens to scan the two in the other order.
 */
export type ForceMatchVerdict = "ALLOWED" | "REQUIRED" | "FORBIDDEN";

type ForceMatchEntry = { account_id: number; forcematch: number };

export function checkForceMatch(a: ForceMatchEntry, b: ForceMatchEntry): ForceMatchVerdict {
    if (a.forcematch === 0 && b.forcematch === 0) return "ALLOWED";

    // a asked for b, and b either asked for a or does not mind who they get.
    if (a.forcematch === b.account_id && (b.forcematch === 0 || b.forcematch === a.account_id)) {
        return "REQUIRED";
    }
    // The same thing the other way round.
    if (b.forcematch === a.account_id && (a.forcematch === 0 || a.forcematch === b.account_id)) {
        return "REQUIRED";
    }

    return "FORBIDDEN";
}

export type QueueItem = {
    type: GameModes;
    account_id: number;
    session_key: string;
    queuedAt: Date;

    // Snapshotted at queue-entry, then RECOMPUTED on every pump tick (and
    // again at match-confirmation) from session.accountData. Closes the
    // power-snapshot race documented in
    // misc/Codebase-Review-Findings-2026-05-07.md § 3.3 item 2:
    // a player can no longer queue at power 6 and play at power 12.
    power: number;

    // Snapshotted at queue-entry, never recomputed. Elo only changes at
    // endgame, after this entry is already gone. Mirrors Java
    // VsFindEntry constructor (VsWorker.java:188-192).
    elo: number;

    // Per-entry mutable window. Starts at VS_WINDOW_POWER_MIN /
    // VS_WINDOW_ELO_MIN (or Number.MAX_SAFE_INTEGER for !eloWindow modes)
    // and grows over wait-time via bumpThreshold. checkWindows enforces
    // BOTH sides' windows — see VsWorker.java:854.
    threshold_power: number;
    threshold_elo: number;

    // Per-entry cap on threshold_power growth.
    threshold_power_max: number;

    // 0 for everyone today (no tournament UI). Hard cross-tourney
    // rejection (Java VsWorker.java:822) is a no-op now but
    // forward-compatible.
    tourney_id: number;

    // The account_id of the one person this player wants to play, or 0 for
    // "anybody". The friend lobby sets it on both sides at once, which is how a
    // private match finds its other half. See checkForceMatch below.
    forcematch: number;

    // The map asked for, or "" for none. Only honoured when both sides asked for a
    // friend match; Battle.ts has the final say on whether the name is one we know.
    scene: string;
};

type QueueDataReport = {
    class: ServerClasses;
    account_id: number;
    type: GameModes;
    powers: number[];
    counts: number[];
};

export const gameQueue: QueueItem[] = [];
export const QueueRouter = asyncRouter();

const calculateLevel = (session: Session): number => {
    // The caller always already holds the session, so read accountData directly
    // instead of an O(n) sessionHandler scan by user_id (#35).
    const acc = session.accountData;
    if (!acc) return 0;

    // Order-independent for the rank sum below, but kept consistent with
    // battle/lobby party construction so future readers don't ask "why is
    // this one different?" (See buildOrderedPartyDefs in account.ts.)
    const partyUnits = buildOrderedPartyDefs(acc.roster_json, acc.party_ids_json);
    return partyUnits.reduce((sum: number, unit: any) => {
        const rank = unit.stats?.find((s: any) => s.stat === "RANK")?.value ?? 1;
        return sum + (rank - 1);
    }, 0);
};

export const getQueue = (type: GameModes, account_id: number): QueueDataReport => {
    // Someone who named an opponent is not waiting for whoever comes along, so they
    // are left out of the "how many are waiting" counts other players see
    // (VsWorker.java:445). Otherwise a pair sitting in a friend lobby would read as
    // open-queue activity that nobody can actually match with.
    let items = gameQueue.filter((item) => item.type === type && item.forcematch === 0);

    let powers: number[] = [];
    let counts: number[] = [];
    items.forEach((item) => {
        let idx = powers.findIndex((power) => power === item.power);
        if (!(idx + 1)) {
            powers.push(item.power);
            counts.push(1);
        } else {
            counts[idx]++;
        }
    });
    let data: QueueDataReport = {
        class: ServerClasses.VS_QUEUE_DATA,
        account_id: account_id,
        type: type,
        powers: powers,
        counts: counts,
    };
    return data;
};

// ---------------------------------------------------------------------------
// Match-creation helpers — used by both the on-entry matchmaking() and the
// 5-second processMatches() pump.
// ---------------------------------------------------------------------------

const removeFromQueue = (item: QueueItem): void => {
    const idx = gameQueue.indexOf(item);
    if (idx >= 0) gameQueue.splice(idx, 1);
};

/**
 * Grow an entry's threshold_power and threshold_elo based on wait-time.
 * Ported from VsWorker.java:242-260. Per-mode behavior matches MODE_CONFIG:
 * equalPower modes (RANKED, TOURNEY) freeze threshold_power at 0; non-eloWindow
 * modes (QUICK) leave threshold_elo at MAX_SAFE_INTEGER.
 */
const bumpItemThresholds = (entry: QueueItem, now: number): void => {
    const cfg = MODE_CONFIG[entry.type];
    const elapsed = now - entry.queuedAt.getTime();

    if (!cfg.equalPower) {
        entry.threshold_power = bumpThreshold(
            elapsed,
            entry.threshold_power,
            VS_WINDOW_POWER_MIN,
            entry.threshold_power_max,
            VS_WINDOW_POWER_TIME_SECS * 1000,
        );
    }
    if (cfg.eloWindow) {
        entry.threshold_elo = bumpThreshold(
            elapsed,
            entry.threshold_elo,
            VS_WINDOW_ELO_MIN,
            VS_WINDOW_ELO_MAX,
            VS_WINDOW_ELO_TIME_SECS * 1000,
        );
    }
};

/**
 * Find the queue entry with the lowest-magnitude bestMatchScore that passes
 * checkWindows. Ported from VsWorker.findBestMatch (VsWorker.java:802-849).
 * Skips self, mismatched tourney_id, and window failures. Type-mismatch is
 * NOT rejected — it's penalized in the scoring (see bestMatchScore).
 *
 * Two people who asked for each other are paired straight away, BEFORE the power
 * and rating windows are consulted — same order as the reference, and not a
 * detail. Those windows start shut (threshold_power is 0 for a fresh entry) and
 * only ever open to a gap of 4, so friends whose parties are further apart than
 * that would otherwise wait for a match that can never be made, with nothing on
 * screen to say why.
 */
export const findBestMatch = (entry: QueueItem): QueueItem | undefined => {
    let best: QueueItem | undefined;
    let bestDiff = Number.POSITIVE_INFINITY;

    for (const other of gameQueue) {
        if (other.account_id === entry.account_id) continue;
        if (other.tourney_id !== entry.tourney_id) continue;

        const force = checkForceMatch(entry, other);
        if (force === "REQUIRED") return other;
        if (force === "FORBIDDEN") continue;

        if (!checkWindows(entry, other)) continue;

        const diff = Math.abs(bestMatchScore(entry, other));
        if (diff < bestDiff) {
            best = other;
            bestDiff = diff;
        }
    }
    return best;
};

/**
 * Re-validate the pair against the current session state, recompute both
 * sides' powers from in-memory accountData (closes the snapshot race), and
 * hand off to battleHandler.addBattle. Returns true if a battle was created.
 *
 * Earlier-queued entry takes party_index=0 — matches the legacy "opponent
 * first, challenger second" ordering in the pre-M2 matchmaking() and the
 * existing BattleFinishedData.rewards[party_index] convention enforced by
 * CLAUDE.md.
 */
const tryCreateBattle = (a: QueueItem, b: QueueItem): boolean => {
    const sessionA = sessionHandler.getSession("session_key", a.session_key);
    const sessionB = sessionHandler.getSession("session_key", b.session_key);
    if (!sessionA?.accountData) {
        removeFromQueue(a);
        return false;
    }
    if (!sessionB?.accountData) {
        removeFromQueue(b);
        return false;
    }

    // Recompute both powers right before the handoff. This is the M2
    // power-recompute race fix: a player who promoted a unit while queued
    // now plays at the fresh value, not the queue-entry snapshot.
    a.power = calculateLevel(sessionA);
    b.power = calculateLevel(sessionB);

    // Window may no longer admit after the fresh recompute — bail and let
    // the next tick try again. Java doesn't re-check; we're stricter
    // because the recompute moves values the original Java never updated.
    // A pair who asked for each other is exempt, for the same reason
    // findBestMatch skips the windows for them: their match was never about
    // whether their parties are evenly matched.
    const forced = checkForceMatch(a, b) === "REQUIRED";
    if (!forced && !checkWindows(a, b)) return false;

    // Earlier-queued = party_index 0. Use queue position (insertion order)
    // since indexOf is O(n) but the array is small.
    const aIdx = gameQueue.indexOf(a);
    const bIdx = gameQueue.indexOf(b);
    const [p0Item, p0Session, p1Item, p1Session] = bIdx >= 0 && bIdx < aIdx
        ? [b, sessionB, a, sessionA]
        : [a, sessionA, b, sessionB];

    // A battle only counts as friendly when BOTH players asked for a friend match
    // (VsWorker.java:705). One person naming an opponent who is simply waiting in the
    // open queue is a normal battle for both of them — it pays renown and moves rating.
    const friendly = a.type === GameModes.FRIEND && b.type === GameModes.FRIEND;

    // The map is taken from the friend lobby, and only from it. Both players read it
    // off the same lobby so the two requests agree; taking the earlier entry's makes
    // the outcome the same every time even if they ever disagree. Withholding it from
    // a non-friendly pair also means nobody can pick the map for a stranger they
    // pulled out of the open queue.
    const scene = friendly ? (p0Item.scene || p1Item.scene) : "";

    console.log(`[MATCHMAKING] Creating battle between ${p0Session.user_id} (power=${p0Item.power}, elo=${p0Item.elo}) and ${p1Session.user_id} (power=${p1Item.power}, elo=${p1Item.elo})${forced ? " — they asked for each other" : ""}${friendly ? ` friendly map=${scene || "(none asked for)"}` : ""}`);

    battleHandler.addBattle(
        [p0Session, p1Session],
        a.type,
        [
            { power: p0Item.power, elo: p0Item.elo },
            { power: p1Item.power, elo: p1Item.elo },
        ],
        { friendly, scene },
    );
    removeFromQueue(a);
    removeFromQueue(b);
    notifyQueueUpdate(a);
    return true;
};

// Pre-M2 behavior preserved verbatim for instant rollback via
// BSF_MATCHMAKER_LEGACY=true. Exact-power, exact-type match; no Elo
// consideration; no bracket widening. The addBattle call uses the new
// per-side array signature with elo defaulted to 0 — same numbers the
// pre-M2 BattlePartyData wrote for QUICK matches.
const legacyMatchmaking = (item: QueueItem) => {
    const match = gameQueue.find(
        (i) => i.account_id !== item.account_id && i.type === item.type && i.power === item.power,
    );
    if (!match) return;
    const opponent = sessionHandler.getSession("session_key", match.session_key);
    if (!opponent) {
        removeFromQueue(match);
        return;
    }
    const challenger = sessionHandler.getSession("session_key", item.session_key);
    if (!challenger) {
        removeFromQueue(item);
        return;
    }
    // Matching rules here are deliberately untouched pre-M2 behaviour. The friendly
    // flag is not a matching rule though — getting it wrong under rollback would pay
    // renown for a friend match — so it is computed the same way as on the live path.
    const friendly = match.type === GameModes.FRIEND && item.type === GameModes.FRIEND;
    battleHandler.addBattle(
        [opponent, challenger],
        item.type,
        [
            { power: match.power, elo: match.elo },
            { power: item.power, elo: item.elo },
        ],
        { friendly, scene: friendly ? (match.scene || item.scene) : "" },
    );
    removeFromQueue(match);
    removeFromQueue(item);
};

/**
 * Try to match an entry against the rest of the queue. Called on entry
 * (from /vs/start) so two players queuing at the same instant pair
 * immediately. Initial threshold_power is VS_WINDOW_POWER_MIN (0), so
 * on-entry matching effectively requires near-equal power until the
 * peer's threshold has widened on a prior tick.
 *
 * The `_challenger` parameter is unused — kept for backward compatibility
 * with the existing test signature `matchmaking(item, challenger)`.
 */
export const matchmaking = (item: QueueItem, _challenger: Session) => {
    if (isLegacyMode()) {
        legacyMatchmaking(item);
        return;
    }

    const match = findBestMatch(item);
    if (!match) return;
    tryCreateBattle(item, match);
};

/**
 * Periodic pump. Iterates the queue, refreshes power for each entry from
 * current accountData (closes the snapshot race), tries to pair via
 * findBestMatch, or widens windows for the next tick. No-op in LEGACY mode.
 *
 * Exported so tests can drive it directly with a fake `now` without
 * needing vi.useFakeTimers().
 */
export const processMatches = (now: number = Date.now()): void => {
    if (isLegacyMode()) return;

    // Snapshot to guard against concurrent splices from /vs/start or
    // /vs/cancel running on the same event-loop tick after an await.
    const snapshot = [...gameQueue];
    for (const entry of snapshot) {
        // Drop if a prior iteration removed this entry (e.g., it was
        // matched in this same pass as the other side of a pair).
        if (gameQueue.indexOf(entry) < 0) continue;

        const session = sessionHandler.getSession("session_key", entry.session_key);
        if (!session?.accountData) {
            removeFromQueue(entry);
            continue;
        }

        const freshPower = calculateLevel(session);
        if (freshPower !== entry.power) {
            entry.power = freshPower;
        }

        const match = findBestMatch(entry);
        if (match) {
            tryCreateBattle(entry, match);
            continue;
        }

        bumpItemThresholds(entry, now);
    }
};

// ---------------------------------------------------------------------------
// Pump lifecycle. Auto-starts at module load (same pattern as auth.ts:159
// session reaper). Tests can call stopMatchmakerPump() in beforeEach to
// keep the interval from firing under fake timers.
// ---------------------------------------------------------------------------

let pumpHandle: NodeJS.Timeout | undefined;

export const startMatchmakerPump = (): void => {
    if (pumpHandle) return;
    pumpHandle = setInterval(() => processMatches(), VS_CHECK_MS);
    pumpHandle.unref();
};

export const stopMatchmakerPump = (): void => {
    if (pumpHandle) {
        clearInterval(pumpHandle);
        pumpHandle = undefined;
    }
};

startMatchmakerPump();

const notifyQueueUpdate = (item: QueueItem | undefined) => {
    if (!item) return;
    // Nothing is announced for match kinds we do not report on — today that is FRIEND,
    // a private arrangement with no counter in the game. See REPORTED_QUEUE_MODES.
    if (!REPORTED_QUEUE_MODES.includes(item.type)) return;
    let queueData = getQueue(item.type, item.account_id);
    sessionHandler.getSessions().forEach((session) => {
        // if not already in game
        if (!session.battle_id) {
            session.pushData(queueData);
        }
    });
};

const QUEUE_TIMEOUT_MS = 5 * 60 * 1000;

// .unref() so this 1-minute sweep doesn't block process shutdown — same
// pattern the new matchmaker pump uses, and the same one-line fix the
// session reaper in auth.ts:159 already has.
const queueTimeoutHandle = setInterval(() => {
    const now = Date.now();
    for (let i = gameQueue.length - 1; i >= 0; i--) {
        const item = gameQueue[i];
        if (now - item.queuedAt.getTime() > QUEUE_TIMEOUT_MS) {
            gameQueue.splice(i, 1);
            const session = sessionHandler.getSession("session_key", item.session_key);
            if (session) notifyQueueUpdate(item);
            console.log(`[QUEUE] Timed out player ${item.account_id} after 5 min`);
        }
    }
}, 60_000);
queueTimeoutHandle.unref();

export const dequeuePlayer = (session_key: string): void => {
    const idx = gameQueue.findIndex((i) => i.session_key === session_key);
    if (idx >= 0) {
        const removed = gameQueue.splice(idx, 1)[0];
        notifyQueueUpdate(removed);
    }
};

// ELO_BEGIN matches src/services/battle/ranking.ts. Re-declared here to keep
// queue.ts free of a bidirectional import; the value is part of the ported
// 2013 Java spec (BattleRanking.ELO_BEGIN = 1000) so it won't drift.
const ELO_BEGIN_FALLBACK = 1000;

// Build a fresh QueueItem with thresholds set to their initial Java values.
// Mirrors VsFindEntry constructor (VsWorker.java:161-224).
const createQueueItem = (
    session: Session,
    vsType: GameModes,
    power: number,
    elo: number,
    tourney_id: number,
    forcematch: number,
    scene: string,
): QueueItem => {
    const cfg = MODE_CONFIG[vsType];
    return {
        account_id: session.account_id,
        type: vsType,
        session_key: session.session_key,
        queuedAt: new Date(),
        power,
        elo,
        // Java: this.threshold_power = config.VS_WINDOW_POWER_MIN. For
        // equalPower modes (RANKED, TOURNEY) bumpItemThresholds will leave
        // it at 0; for QUICK it widens over time.
        threshold_power: VS_WINDOW_POWER_MIN,
        // Java: eloWindow ? VS_WINDOW_ELO_MIN : Integer.MAX_VALUE. Modes
        // that don't match on Elo (QUICK) skip the Elo check entirely.
        threshold_elo: cfg.eloWindow ? VS_WINDOW_ELO_MIN : Number.MAX_SAFE_INTEGER,
        threshold_power_max: VS_WINDOW_POWER_MAX,
        tourney_id,
        forcematch,
        scene,
    };
};

// join or leave game queue
QueueRouter.post("/start/:session_key", async (req, res) => {
    let session: Session = (req as any).session;

    // Fix #7: prevent the same player from entering the queue twice
    if (gameQueue.some((i) => i.account_id === session.account_id)) {
        res.sendStatus(409);
        return;
    }

    // MED-4: validate vs_type against known GameModes before entering queue
    const vsType = req.body.vs_type;
    if (!Object.values(GameModes).includes(vsType)) {
        // Say so out loud. The [QUEUE] line further down never fires for a refused type,
        // so without this a match request the game cannot recover from disappears with no
        // trace anywhere. That is exactly how the friend lobby's dead end looked from the
        // server console during the #91 smoke test on 2026-08-27: silent.
        console.warn(`[QUEUE] refused unknown vs_type=${JSON.stringify(vsType)} from account=${session.account_id}`);
        res.sendStatus(400);
        return;
    }

    // #205: who this player wants to play, and where. The friend lobby fills both in;
    // every other screen sends neither. A missing or nonsense value means "anybody",
    // which is what the open queue already did.
    const forcematchRaw = Number(req.body.forcematch);
    const forcematch = Number.isFinite(forcematchRaw) && forcematchRaw > 0 ? forcematchRaw : 0;
    const scene = typeof req.body.scene === "string" ? req.body.scene : "";

    // Asking to play yourself can never be satisfied — the search skips your own entry —
    // so the player would sit on a spinner until the five-minute timeout with nothing to
    // read. Say no instead. The real game cannot send this; only a modified one can, and
    // 400 is a refusal it does not keep re-sending.
    if (forcematch === session.account_id) {
        console.warn(`[QUEUE] refused self-match request from account=${session.account_id}`);
        res.sendStatus(400);
        return;
    }

    session.match_handle = req.body.match_handle;
    const power = calculateLevel(session);

    // Per-unit power breakdown for diagnosing "why is my power N?" gaps.
    // Walks the same party the matchmaker just summed and prints each
    // unit's RANK plus its (RANK-1) contribution.
    if (session.accountData) {
        const partyUnits = buildOrderedPartyDefs(
            session.accountData.roster_json,
            session.accountData.party_ids_json,
        );
        const breakdown = partyUnits.map((u: any) => {
            const rank = u.stats?.find((s: any) => s.stat === "RANK")?.value ?? 1;
            return `${u.id}:R${rank}=${rank - 1}`;
        }).join(", ");
        console.log(`[QUEUE] account=${session.account_id} user=${session.user_id} vs_type=${vsType} power=${power}${forcematch ? ` forcematch=${forcematch}` : ""}${scene ? ` scene=${scene}` : ""} breakdown=[${breakdown}]`);
    }

    const tourney_id = 0; // No tournament UI today — all queues share tourney_id=0.

    // Snapshot Elo at queue entry for modes that match on Elo. QUICK uses 0
    // (matches Java VsFindEntry.java:191-193 and the pre-M2 BattlePartyData
    // value). If the ranking row read fails (DB locked, etc.), fall back to
    // ELO_BEGIN rather than failing the request — same defensive default
    // applyBattleRankingUpdate uses at endgame.
    let elo = 0;
    if (MODE_CONFIG[vsType as GameModes].eloWindow) {
        try {
            const ranking = await getOrCreateRanking(session.account_id, tourney_id);
            elo = ranking.battle_elo;
        } catch (err) {
            console.warn(`[QUEUE] Elo snapshot failed for account_id=${session.account_id}, defaulting to ${ELO_BEGIN_FALLBACK}:`, err);
            elo = ELO_BEGIN_FALLBACK;
        }
    }

    const item = createQueueItem(session, vsType as GameModes, power, elo, tourney_id, forcematch, scene);

    const queueSizeBefore = gameQueue.length;
    gameQueue.push(item);
    matchmaking(item, session);
    const queueSizeAfter = gameQueue.length;

    // Only notify queue update if a battle was NOT created (queue size would increase by 1, not 0)
    if (queueSizeAfter > queueSizeBefore) {
        notifyQueueUpdate(item);
    }
    // Match real server: respond with ServerStatusData (session count in queue)
    res.json([{ class: ServerClasses.SERVER_STATUS_DATA, session_count: gameQueue.length }]);
});

QueueRouter.post("/cancel/:session_key", (req, res) => {
    let toRemove = gameQueue.findIndex((item) => item.session_key === (req as any).session.session_key);
    if (toRemove >= 0) {
        let removed = gameQueue.splice(toRemove, 1)[0];
        notifyQueueUpdate(removed);
    }
    res.send();
});
