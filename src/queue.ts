import { readFileSync } from 'fs';
import { Session, sessionHandler } from './sessions';
import { ServerClasses, GameModes } from './const';
import { battleHandler } from './battle/Battle';

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

const calculateLevel = (user_id: number, party: Array<string>): number => {
    // get user data from database here
    let acc = JSON.parse(readFileSync("./data/acc.json", 'utf-8'))
    let roster: Array<any> = acc.roster.defs;
    party = acc.party.ids
    let level = 0;

    roster.forEach((member) => {
        if (party.indexOf(member.id) + 1) {
            level += member.stats.find((stats: any) => stats.stat === "RANK").value - 1
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
        if (!(idx+1)) {
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


// TODO: OOPS! something wrong here, if player cancels, 
// they still get queued up. need to pass action to the queue update
// also need to check theyre not matching with themselves
const notifyQueueUpdate = (item: QueueItem, start?: boolean) => {
    let queueData = getQueue(item.type, item.account_id);

    if (start) {
        // matchmaking here
        if (queueData.powers.includes(item.power)) {
            let match = gameQueue.find(match => match.power === item.power && match.account_id !== item.account_id)
            if (match) {
                battleHandler.addBattle([match.account_id, item.account_id], match.type, match.power)
                // if match, remove matched player
                gameQueue.splice(gameQueue.indexOf(match), 1)[0];
                // get queue data after match dequeued
                queueData = getQueue(item.type, match.account_id);
            };
        };
    };

    sessionHandler.getSessions().forEach(
        session => {
            // if not already in game
            if (!session.battle_id) {
                session.pushData(queueData);
            }
        }
    )

    // check for other players and create battle
}

export const queueUpdateCallback = (action: string, session: Session, type: string) => {

    switch (action) {
        case "start":
            let item: QueueItem = {
                account_id: session.user_id,
                type: type as GameModes,
                power: calculateLevel(session.user_id, [])
            };
            gameQueue.push(item)
            notifyQueueUpdate(item, true);
            break;
        case "cancel":
            let toRemove = gameQueue.findIndex(item => item.account_id === session.user_id)
            let removed = gameQueue.splice(toRemove, 1)[0];
            notifyQueueUpdate(removed);
            break;
    }
};
