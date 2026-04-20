import { Session, sessionHandler } from "./auth/auth";
import { ServerClasses, GameModes } from "../const";
import { battleHandler } from "./battle/Battle";
import { Router } from "express";

type QueueItem = {
    type: GameModes;
    account_id: number;
    power: number;
};

type QueueDataReport = {
    class: ServerClasses;
    account_id: number;
    type: GameModes;
    powers: number[];
    counts: number[];
};

const gameQueue: QueueItem[] = [];
export const QueueRouter = Router();

const calculateLevel = (user_id: number): number => {
    const session = sessionHandler.getSession("user_id", user_id);
    const acc = session?.accountData;
    if (!acc) return 0;

    const partyUnits = acc.roster_json.filter((unit: any) => acc.party_ids_json.includes(unit.id));
    return partyUnits.reduce((sum: number, unit: any) => {
        const rank = unit.stats?.find((s: any) => s.stat === "RANK")?.value ?? 1;
        return sum + (rank - 1);
    }, 0);
};

export const getQueue = (type: GameModes, account_id: number): QueueDataReport => {
    let items = gameQueue.filter((item) => item.type === type);

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

// Fix #15: removed misleading power-level guard that was always true (player's own entry
// satisfied it). Now the find itself filters by type AND power correctly.
const matchmaking = (item: QueueItem, challenger: Session) => {
    console.log(`[MATCHMAKING] Player ${item.account_id} joined queue. Queue size: ${gameQueue.length}`);

    // Fix #15: filter by both type AND power so mismatched-power players don't get paired
    const match = gameQueue.find(
        (i) => i.account_id !== item.account_id && i.type === item.type && i.power === item.power
    );

    console.log(`[MATCHMAKING] Found match: ${match ? `player ${match.account_id}` : "none"}`);
    if (!match) return;

    const opponent = sessionHandler.getSession("user_id", match.account_id);
    if (!opponent) {
        // Opponent disconnected between queuing and matching — clean up their queue entry
        gameQueue.splice(gameQueue.indexOf(match), 1);
        console.warn(`[MATCHMAKING] Opponent session ${match.account_id} not found — removed from queue`);
        return;
    }

    console.log(`[MATCHMAKING] Creating battle between ${challenger.user_id} and ${opponent.user_id}`);
    battleHandler.addBattle([opponent, challenger], match.type, match.power);
    gameQueue.splice(gameQueue.indexOf(match), 1);
    gameQueue.splice(gameQueue.indexOf(item), 1);
    console.log(`[MATCHMAKING] Battle created. Queue size after: ${gameQueue.length}`);
};

const notifyQueueUpdate = (item: QueueItem | undefined) => {
    if (!item) return;
    let queueData = getQueue(item.type, item.account_id);
    sessionHandler.getSessions().forEach((session) => {
        // if not already in game
        if (!session.battle_id) {
            session.pushData(queueData);
        }
    });
};

// join or leave game queue
QueueRouter.post("/start/:session_key", (req, res) => {
    let session: Session = (req as any).session;

    // Fix #7: prevent the same player from entering the queue twice
    if (gameQueue.some((i) => i.account_id === session.user_id)) {
        res.sendStatus(409);
        return;
    }

    // MED-4: validate vs_type against known GameModes before entering queue
    const vsType = req.body.vs_type;
    if (!Object.values(GameModes).includes(vsType)) {
        res.sendStatus(400);
        return;
    }

    session.match_handle = req.body.match_handle;
    let item: QueueItem = {
        account_id: session.user_id,
        type: vsType as GameModes,
        power: calculateLevel(session.user_id),
    };

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
    let toRemove = gameQueue.findIndex((item) => item.account_id === (req as any).session.user_id);
    if (toRemove >= 0) {
        let removed = gameQueue.splice(toRemove, 1)[0];
        notifyQueueUpdate(removed);
    }
    res.send();
});
