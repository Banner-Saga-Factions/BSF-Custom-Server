import { readFileSync } from 'fs';
import { Session, sessionHandler } from './sessions';

export type gameMode = ["QUICK", "RANKED", "TOURNEY"];

type QueueItem = {
    type: gameMode[number],
    account_id: number,
    powers: Array<number>,
}
type QueueDataReport = QueueItem & {
    class: "tbs.srv.data.VsQueueData",
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

const notifyQueueUpdate = (item: QueueItem) => {

    // powers and count here are incorrect, 
    // TODO: implement some function to get this info
    let update: QueueDataReport = {
        class: "tbs.srv.data.VsQueueData",
        account_id: item.account_id,
        type: item.type,
        powers: item.powers,
        counts: [gameQueue.filter(player => player.type === item.type && player.powers[0] === item.powers[0]).length]
    };

    // TODO: figure out if sessions should be updated before game found 
    // or check if can make game then only update if no game
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
            notifyQueueUpdate(
                gameQueue[gameQueue.push({
                    account_id: session.user_id,
                    type: type as gameMode[number],
                    powers: [calculateLevel(session.user_id, [])]
                }) - 1]);
            break;
        case "cancel":
            notifyQueueUpdate(
                gameQueue.splice(
                    gameQueue.findIndex(item => item.account_id === session.user_id),
                    1)[0]);
            break;
    }
};
