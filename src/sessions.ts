
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

export interface Session {
    display_name: string;
    user_id: number;
    session_key: string;
    data: Array<any>;
    battle_id?: string; // maybe not needed?
}

var sessions: Array<Session> = [];

export const sessionHandler = {
    getSessions: (): Array<Session> => {
        return sessions;
    },
    newSession: (user_id: number) => {
        // look up user in database and return data
        let user = JSON.parse(readFileSync("./data/accounts.json", "utf-8")).find(
            (account:any) => account.user_id === user_id
        )
        let session: Session = {
            display_name: user.display_name,
            user_id: user_id,
            session_key: generateKey(),
            data: getInitialData()
        }

        sessions.push(session);
        return session;
    },
    getSession: (session_key: string): Session | undefined => {
        return sessions.find(session => session.session_key === session_key);
    },
    removeSession: (session_key: string) => {
        sessions = sessions.filter(session => session.session_key !== session_key);
    },
    pushData: (session:Session, data:any) =>{
        session.data.push(data)
    }

}