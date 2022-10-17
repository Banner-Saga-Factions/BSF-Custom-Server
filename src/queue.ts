import { readFileSync } from 'fs';

export type QueueItem = {
    type: "QUICK" | "RANKED" | "TOURNEY",
    account_id: number,
    power: Array<number>,
    count: Array<number>
};

const queue: Array<QueueItem> = [];

export const queueHandler = {
    calculateLevel: (session_key: string, party: Array<string>): number => {
        // get user data from database here
        // eg get user -> let user = getSession(session_key).user_id
        // look up user id in database
        let roster: Array<any> = JSON.parse(readFileSync("./data/acc.json", 'utf-8')).roster.defs;
        let level = 0;

        party.forEach((member: string) => {
            level += roster.find(entity => entity.id === member).stats.find((stat: any) => stat.stat === "RANK").value - 1
        })
        return level;
    }

}


