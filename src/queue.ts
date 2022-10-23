import { readFileSync } from 'fs';
import { Session, sessionHandler } from './sessions';
import { ServerClasses, GameModes } from './const';

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

const getQueueStats = (GameMode: GameModes): Array<Array<number>> => {
    let items = gameQueue.filter(item => item.type === GameMode)
    let powers: Array<number> = []
    let counts: Array<number> = []
    items.forEach(item => {
        let idx = powers.find(power => power === item.power)
        if (!idx) {
            powers.push(item.power);
            counts.push(1);
        } else {
            counts[idx]++;
        }
    })
    return [powers, counts]
};

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

// TODO: OOPS! something wrong here, if player cancels, 
// they still get queued up. need to pass action to the queue update
// also need to check theyre not matching with themselves
const notifyQueueUpdate = (item: QueueItem) => {

    let [powers, counts] = getQueueStats(item.type);

    if (powers.includes(item.power)) {
        let match = gameQueue.find(match => match.power === item.power)
        if (match) {
            gameQueue.splice(gameQueue.indexOf(match), 1)[0];
            [powers, counts] = getQueueStats(item.type);

        };
    }

    let update: QueueDataReport = {
        class: ServerClasses.VS_QUEUE_DATA,
        account_id: item.account_id,
        type: item.type,
        powers: powers,
        counts: counts,
    };

    // TODO: figure out if sessions should be updated before game found 
    // or check if can make game then only update if no game
    // looking at old data I think if a user queues and is matched other players are still notified of the queue
    sessionHandler.getSessions().forEach(
        session => {
            // if not already in game
            if (!session.battle_id) {
                session.pushData(update);
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
            notifyQueueUpdate(item);
            break;
        case "cancel":
            let toRemove = gameQueue.findIndex(item => item.account_id === session.user_id)
            let removed = gameQueue.splice(toRemove, 1)[0];
            notifyQueueUpdate(removed);
            break;
    }
};
