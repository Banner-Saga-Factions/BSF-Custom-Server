
import crypto from "crypto";
import { readFileSync } from 'fs';
import { getQueue } from "./queue";
import { GameModes } from "./const";

const build_number = readFileSync("./data/build-number", 'utf-8');

var generateKey = () => {
    return crypto.randomBytes(8).toString("hex");
};

export const getInitialData = (): Array<any> => {
    // should take user_id arg to check currency data and friend data
    // return initial queue data [done], tournament data, currency data, friend data
    let initialData: Array<any> = []

    for (const type of Object.values(GameModes)) {
        initialData.push(getQueue(type, 0))
    }
    initialData.concat(JSON.parse(readFileSync("./data/first.json", 'utf-8')));
    return initialData
}


const getUser = (user_id: number) => {
    // look up user in database and return data
    // needs some form of authentication
    // maybe a user_id stored in a jwt token 
    // which can be passed as the username to the game from an external client
    // anyway... on with the demo
    return JSON.parse(readFileSync("./data/accounts.json", 'utf-8')).find(
        (acc: any) => acc.user_id === user_id);
};

export class Session {

    display_name: string;
    user_id: number;
    session_key: string;

    data: Array<any>;
    battle_id?: string; // maybe not needed?
    match_handle: number = 0; // TODO: this is a work around

    constructor(user_id: number) {
        this.display_name = getUser(user_id).username;
        this.user_id = user_id;
        this.session_key = generateKey();
        this.data = getInitialData();
    };

    asJson() {
        return {
            display_name: this.display_name,
            build_number: build_number,
            user_id: this.user_id,
            vbb_name: null,
            session_key: this.session_key,
        }
    };

    pushData(data: any) {
        this.data.push(data);
    };
}

var sessions: Array<Session> = [];

export const sessionHandler = {
    getSessions: (): Array<Session> => {
        return sessions;
    },
    // display name shouldn't be needed here but just for now
    addSession: (user_id: number) => {
        let session = new Session(user_id);
        sessions.push(session);
        return session.asJson();
    },
    getSession: (key: string, value: any): Session | undefined => {
        return sessions.find(session => (session as any)[key] === value);
    },
    removeSession: (session_key: string) => {
        sessions = sessions.filter(session => session.session_key !== session_key);
    }

}