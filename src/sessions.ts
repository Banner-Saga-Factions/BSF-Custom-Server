
import crypto from "crypto";
import { readFileSync } from 'fs';
import { getQueue } from "./queue";
import { GameModes } from "./const";
import { Router } from "express";
import * as UserFunctions from './api/utils/users/users.controller';

const build_number = readFileSync("./data/build-number", 'utf-8');
export const AuthRouter = Router();

var generateKey = () => {
    return crypto.randomBytes(8).toString("hex");
};

const getInitialData = (): Array<any> => {
    // should take user_id arg to check currency data and friend data
    // return initial queue data [done], tournament data, currency data, friend data
    let initialData: Array<any> = []

    for (const type of Object.values(GameModes)) {
        initialData.push(getQueue(type, 0))
    }
    initialData.concat(JSON.parse(readFileSync("./data/first.json", 'utf-8')));
    return initialData
}

type SessionOptions = (s: Session) => void;

export class Session {

    display_name: string;
    user_id: number;
    session_key: string;

    data: Array<any>;
    battle_id?: string; // maybe not needed?
    match_handle: number = 0; // TODO: this is a work around

    constructor() {

        this.display_name = "";
        this.user_id = 0;
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

    public SetDisplayName(displayName: string): SessionOptions {
        return (s: Session): void => {
          s.display_name = displayName
        }
      }

    public static async GetSessionInit(user_id: number) {
        //Get user from DB by comparing ID 
        //--IMP!! Will need to eventually verify username + password IMP!!--
        const user = await UserFunctions.getUser(user_id);

        if(user != null){ //If a user is found / matched credentials
            var userJson = JSON.parse(JSON.stringify(user));
            
            //add login count (if successful)
            await UserFunctions.updateUserLoginCount(userJson[0].id);
            
            const s = new Session();

            s.display_name = userJson[0].username;
            s.user_id = userJson[0].id
            
            return s;
        } else {
            return null;
        }
    }
}

var sessions: Array<Session> = [];

export const sessionHandler = {
    getSessions: (filter?: Function): Array<Session> => {
        if (filter) return sessions.filter(session => filter);
        return sessions;
    },
    addSession: async (user_id: number) => {
        const session = await Session.GetSessionInit(user_id);

        if(session != null){
            sessions.push(session);
            return session.asJson();
        } else {
            return null;
        }
    },
    getSession: (key: string, value: any): Session => {
        return sessions.find(session => (session as any)[key] === value) as Session;
    },
    removeSession: (session_key: string) => {
        sessions = sessions.filter(session => session.session_key !== session_key);
    }
};

AuthRouter.post('/login/:session_key', async (req, res) => {
    let userData = await sessionHandler.addSession(req.body.steam_id);
    res.json(userData);
});

AuthRouter.post("/logout/:session_key", (req, res) => {
    sessionHandler.removeSession(req.params.session_key);
    res.send();
});
