import { readFileSync } from "fs";
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

const calculateLevel = (user_id: number, party: string[]): number => {
    // get user data from database here with user_id

    // the vs/start message sends the party data to the server,
    // but the server already keeps a copy which gets updated on every change to the party
    // so im not sure why theres both, unless to check against each other
    // but id imagine the server should always take precendece over the player
    let acc = JSON.parse(readFileSync("./data/acc.json", "utf-8"));
    let units: any[] = (acc.roster.defs as any[]).filter((unit) => acc.party.ids.includes(unit.id));
    party = acc.party.ids;
    let level = 0;

    units.forEach((unit) => {
        if (party.indexOf(unit.id) + 1) {
            level += unit.stats.find((stats: any) => stats.stat === "RANK").value - 1;
        }
    });
    return level;
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

// FIXME: This whole section below to the end of the file needs some work

const matchmaking = (item: QueueItem, challenger: Session) => {
    // matchmaking (first come first served)
    console.log(`[MATCHMAKING] Player ${item.account_id} joined queue. Queue size: ${gameQueue.length}`);
    let queueData = getQueue(item.type, item.account_id);
    console.log(`[MATCHMAKING] Queue powers: ${queueData.powers}, looking for power: ${item.power}`);
    if (queueData.powers.includes(item.power)) {
        let match = gameQueue.find((i) => i.account_id !== item.account_id && i.type === item.type);
        console.log(`[MATCHMAKING] Found match: ${match ? `player ${match.account_id}` : "none"}`);
        if (match) {
            let opponent = sessionHandler.getSession("user_id", match.account_id);
            console.log(`[MATCHMAKING] Opponent session: ${opponent ? `found` : "NOT FOUND"}`);
            if (!opponent) return; // TODO: handle this case
            console.log(`[MATCHMAKING] Creating battle between ${challenger.user_id} and ${opponent.user_id}`);
            battleHandler.addBattle([opponent, challenger], match.type, match.power);
            // Remove BOTH players from queue when battle created
            gameQueue.splice(gameQueue.indexOf(match), 1);
            gameQueue.splice(gameQueue.indexOf(item), 1);
            console.log(`[MATCHMAKING] Battle created. Queue size after removal: ${gameQueue.length}`);
        }
    }
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
    session.match_handle = req.body.match_handle;
    let item: QueueItem = {
        account_id: session.user_id,
        type: req.body.vs_type as GameModes,
        power: calculateLevel(session.user_id, []),
    };
    //
    const queueSizeBefore = gameQueue.length;
    gameQueue.push(item);
    matchmaking(item, session);
    const queueSizeAfter = gameQueue.length;
    
    // Only notify queue update if a battle was NOT created (queue size would increase by 1, not 0)
    if (queueSizeAfter > queueSizeBefore) {
        notifyQueueUpdate(item);
    }
    res.send();
});

QueueRouter.post("/cancel/:session_key", (req, res) => {
    let toRemove = gameQueue.findIndex((item) => item.account_id === (req as any).session.user_id);
    if (toRemove >= 0) {
        let removed = gameQueue.splice(toRemove, 1)[0];
        notifyQueueUpdate(removed);
    }
    res.send();
});
