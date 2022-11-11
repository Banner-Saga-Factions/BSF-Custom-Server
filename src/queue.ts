import { readFileSync } from 'fs';
import { Session, sessionHandler } from './sessions';
import { ServerClasses, GameModes } from './const';
import { battleHandler } from './battle/Battle';
import { Router } from "express";

type QueueItem = {
    type: GameModes,
    account_id: number,
    power: number,
};

type QueueDataReport = {
    class: ServerClasses,
    account_id: number,
    type: GameModes,
    powers: Array<number>,
    counts: Array<number>
};

const gameQueue: Array<QueueItem> = [];
export const QueueRouter = Router();

const calculateLevel = (user_id: number, party: Array<string>): number => {
    // get user data from database here with user_id

    // the vs/start message sends the party data to the server,
    // but the server already keeps a copy which gets updated on every change to the party
    // so im not sure why theres both, unless to check against each other 
    // but id imagine the server should always take precendece over the player
    let acc = JSON.parse(readFileSync("./data/acc.json", 'utf-8'))
    let units: Array<any> = (acc.roster.defs as Array<any>).filter(unit => acc.party.ids.includes(unit.id));
    party = acc.party.ids
    let level = 0;

    units.forEach((unit) => {
        if (party.indexOf(unit.id) + 1) {
            level += unit.stats.find((stats: any) => stats.stat === "RANK").value - 1
        }
    })
    return level;
};

export const getQueue = (type: GameModes, account_id: number): QueueDataReport => {
    let items = gameQueue.filter(item => item.type === type)

    let powers: Array<number> = []
    let counts: Array<number> = []
    items.forEach(item => {
        let idx = powers.findIndex(power => power === item.power)
        if (!(idx + 1)) {
            powers.push(item.power);
            counts.push(1);
        } else {
            counts[idx]++;
        }
    })
    let data: QueueDataReport = {
        class: ServerClasses.VS_QUEUE_DATA,
        account_id: account_id,
        type: type,
        powers: powers,
        counts: counts
    }
    return data;
}


// XXX: This whole section below to the end of the file needs some work

const matchmaking = (item: QueueItem, challenger: Session) => {
    // matchmaking (first come first served)
    let queueData = getQueue(item.type, item.account_id);
    if (queueData.powers.includes(item.power)) {
        let match = gameQueue.find(match => match.power === item.power && match.account_id !== item.account_id)
        if (match) {
            let opponent = sessionHandler.getSession("user_id", match.account_id)
            battleHandler.addBattle([opponent, challenger], match.type, match.power)
            // if match, remove matched player
            gameQueue.splice(gameQueue.indexOf(match), 1)[0];
            // get queue data after match dequeued
        };
    };
}

const notifyQueueUpdate = (item: QueueItem) => {
    let queueData = getQueue(item.type, item.account_id);
    sessionHandler.getSessions().forEach(
        session => {
            // if not already in game
            if (!session.battle_id) {
                session.pushData(queueData);
            }
        }
    )
};

// join or leave game queue
QueueRouter.post("/start/:session_key", (req, res) => {
    let session = (req as any).session
    session.match_handle = req.body.match_handle
    let item: QueueItem = {
        account_id: session.user_id,
        type: req.body.vs_type as GameModes,
        power: calculateLevel(session.user_id, [])
    };
    // 
    gameQueue.push(item);
    matchmaking(item, session);
    notifyQueueUpdate(item);
    res.send();
});

QueueRouter.post("/cancel/:session_key", (req, res) => {
    let toRemove = gameQueue.findIndex(item => item.account_id === (req as any).session.user_id)
    let removed = gameQueue.splice(toRemove, 1)[0];
    notifyQueueUpdate(removed);
    res.send();
})
