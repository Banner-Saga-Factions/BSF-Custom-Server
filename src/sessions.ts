
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
    
    for (const type of Object.values(GameModes)){
        initialData.push(getQueue(type, 0))
    }
    initialData.concat(JSON.parse(readFileSync("./data/first.json", 'utf-8')));
    return initialData
}


const getUserId = (username: string) => {
    // look up user in database and return data
    // needs some form of authentication
    // maybe a user_id stored in a jwt token 
    // which can be passed as the username to the game from an external client
    // anyway... on with the demo
    return JSON.parse(readFileSync("./data/accounts.json", 'utf-8')).filter(
        (acc: any) => acc.username === username)[0].user_id;
};

export class Session {

    display_name: string;
    build_number: string;
    user_id: number;
    vbb_name: string | null;
    session_key: string;

    data: Array<any>;
    battle_id?: string; // maybe not needed?

    constructor(display_name: string, username: string,
        vbb_name?: string) {
        this.display_name = display_name;
        this.build_number = build_number;
        this.user_id = getUserId(username);
        this.vbb_name = vbb_name ? vbb_name : null
        this.session_key = generateKey();
        this.data = getInitialData();

    };

    asJson() {
        return {
            display_name: this.display_name,
            build_number: this.build_number,
            user_id: this.user_id,
            vbb_name: this.vbb_name,
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
    addSession: (display_name: string, username: string, vbb_name?: string) => {
        let session = new Session(display_name, username, vbb_name);
        sessions.push(session);
        return session;
    },
    getSession: (session_key: string): Session | undefined => {
        return sessions.find(session => session.session_key === session_key);
    },
    removeSession: (session_key: string) => {
        sessions = sessions.filter(session => session.session_key !== session_key);
    }

}