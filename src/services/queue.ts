import { Session, sessionHandler } from "./auth/auth";
import { ServerClasses, GameModes } from "../const";
import { battleHandler } from "./battle/Battle";
import { Router } from "express";
import { getPartyInfo } from "./playerData";

type QueueEntry = {
    accountId: number;
    sessionKey: string;
    vsType: GameModes;
    matchHandle: number;
    joinTimestamp: number;
    power: number;
    mmr: number;
    party: string[];
};

type QueueDataReport = {
    class: ServerClasses;
    account_id: number;
    type: GameModes;
    powers: number[];
    counts: number[];
};

const QUEUE_POWER_BASE_WINDOW = 1;
const QUEUE_POWER_EXPANSION_INTERVAL_MS = 15_000;
const QUEUE_POWER_EXPANSION_STEP = 1;
const QUEUE_RATING_BASE_WINDOW = 100;
const QUEUE_RATING_EXPANSION_INTERVAL_MS = 20_000;
const QUEUE_RATING_EXPANSION_STEP = 150;

const DEFAULT_RATING = 1000;

const queues: Record<GameModes, QueueEntry[]> = {
    [GameModes.QUICK]: [],
    [GameModes.RANKED]: [],
    [GameModes.TOURNEY]: [],
};

export const QueueRouter = Router();

const calculatePartyPower = (user_id: number): { party: string[]; power: number } => {
    const { partyIds, power } = getPartyInfo(user_id);
    return { party: partyIds, power };
};

const getPlayerRating = (user_id: number, type: GameModes, fallbackPower: number): number => {
    if (type === GameModes.QUICK) return fallbackPower;
    return DEFAULT_RATING;
};

export const getQueue = (type: GameModes, account_id: number): QueueDataReport => {
    const items = queues[type];
    const powers: number[] = [];
    const counts: number[] = [];

    items.forEach((item) => {
        const idx = powers.findIndex((power) => power === item.power);
        if (idx === -1) {
            powers.push(item.power);
            counts.push(1);
        } else {
            counts[idx]++;
        }
    });

    return {
        class: ServerClasses.VS_QUEUE_DATA,
        account_id,
        type,
        powers,
        counts,
    };
};

const notifyQueueUpdate = (type: GameModes, account_id: number) => {
    const queueData = getQueue(type, account_id);
    sessionHandler.getSessions((session) => !session.battle_id).forEach((session) => {
        session.pushData({
            ...queueData,
            account_id: session.user_id,
        });
    });
};

const removeQueueEntry = (accountId: number, type?: GameModes): QueueEntry | undefined => {
    const types: GameModes[] = type ? [type] : (Object.values(GameModes) as GameModes[]);

    for (const queueType of types) {
        const queue = queues[queueType];
        const idx = queue.findIndex((entry) => entry.accountId === accountId);
        if (idx !== -1) {
            const [removed] = queue.splice(idx, 1);
            notifyQueueUpdate(queueType, removed.accountId);
            return removed;
        }
    }
    return undefined;
};

const computePowerWindow = (waitTime: number) => {
    const increments = Math.floor(waitTime / QUEUE_POWER_EXPANSION_INTERVAL_MS);
    return QUEUE_POWER_BASE_WINDOW + increments * QUEUE_POWER_EXPANSION_STEP;
};

const computeRatingWindow = (waitTime: number) => {
    const increments = Math.floor(waitTime / QUEUE_RATING_EXPANSION_INTERVAL_MS);
    return QUEUE_RATING_BASE_WINDOW + increments * QUEUE_RATING_EXPANSION_STEP;
};

const findMatch = (entry: QueueEntry): QueueEntry | undefined => {
    const queue = queues[entry.vsType];
    const now = Date.now();
    let bestCandidate: QueueEntry | undefined;
    let bestScore = Number.POSITIVE_INFINITY;

    queue.forEach((candidate) => {
        if (candidate.accountId === entry.accountId) return;
        const waitTime = Math.max(now - entry.joinTimestamp, now - candidate.joinTimestamp);
        const powerWindow = computePowerWindow(waitTime);
        const ratingWindow = computeRatingWindow(waitTime);
        const powerDiff = Math.abs(candidate.power - entry.power);
        const ratingDiff = Math.abs(candidate.mmr - entry.mmr);

        if (powerDiff <= powerWindow && ratingDiff <= ratingWindow) {
            const score = powerDiff + ratingDiff / 100; // bias towards closer power first
            if (score < bestScore) {
                bestScore = score;
                bestCandidate = candidate;
            }
        }
    });

    return bestCandidate;
};

const startMatch = (challenger: QueueEntry, opponent: QueueEntry) => {
    // remove both entries from queue before starting battle
    removeQueueEntry(challenger.accountId, challenger.vsType);
    removeQueueEntry(opponent.accountId, opponent.vsType);

    const challengerSession = sessionHandler.getSession("user_id", challenger.accountId);
    const opponentSession = sessionHandler.getSession("user_id", opponent.accountId);

    if (!challengerSession || !opponentSession) {
        return;
    }

    battleHandler.addBattle([challengerSession, opponentSession], challenger.vsType);
};

const matchmaking = (entry: QueueEntry) => {
    const opponent = findMatch(entry);
    if (opponent) {
        startMatch(entry, opponent);
    }
};

export const removePlayerFromQueues = (accountId: number) => {
    removeQueueEntry(accountId);
};

QueueRouter.post("/start/:session_key", (req, res) => {
    const session: Session = (req as any).session;
    const vsType = req.body.vs_type as GameModes;

    if (!vsType) {
        res.status(400).send("Missing vs_type");
        return;
    }

    // prevent duplicate entries for the same player/mode
    removeQueueEntry(session.user_id, vsType);

    session.match_handle = req.body.match_handle;
    const { party, power } = calculatePartyPower(session.user_id);
    const mmr = getPlayerRating(session.user_id, vsType, power);

    const entry: QueueEntry = {
        accountId: session.user_id,
        sessionKey: session.session_key,
        vsType,
        matchHandle: req.body.match_handle,
        joinTimestamp: Date.now(),
        power,
        mmr,
        party,
    };

    queues[vsType].push(entry);
    matchmaking(entry);
    notifyQueueUpdate(vsType, session.user_id);
    res.send();
});

QueueRouter.post("/cancel/:session_key", (req, res) => {
    const session: Session = (req as any).session;
    const vsType = req.body.vs_type as GameModes | undefined;

    const removed = removeQueueEntry(session.user_id, vsType);
    if (!removed) {
        res.status(404).send();
        return;
    }

    res.send();
});
