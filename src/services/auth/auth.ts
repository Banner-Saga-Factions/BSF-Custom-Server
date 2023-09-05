import crypto from "crypto";
import { readFileSync } from "fs";
import { getQueue } from "../queue";
import { GameModes } from "../../const";
import { Router } from "express";
import { verify } from "jsonwebtoken";
import { config } from "dotenv";
import * as UserFunctions from "@api/utils/users/users.controller";

config();

const build_number = readFileSync("./data/build-number", "utf-8");
export const AuthRouter = Router();

var generateKey = () => {
    return crypto.randomBytes(8).toString("hex");
};

const getInitialData = (): any[] => {
    // should take user_id arg to check currency data and friend data
    // return initial queue data [done], tournament data, currency data, friend data
    let initialData: any[] = [];

    for (const type of Object.values(GameModes)) {
        initialData.push(getQueue(type, 0));
    }
    initialData.concat(JSON.parse(readFileSync("./data/first.json", "utf-8")));
    return initialData;
};

type SessionOptions = (s: Session) => void;

export class Session {
    display_name: string;
    user_id: number;
    session_key: string;

    data: any[];
    battle_id?: string; // maybe not needed?
    match_handle: number = 0; // TODO: this is a work around

    constructor() {
        this.display_name = "";
        this.user_id = 0;
        this.session_key = generateKey();
        this.data = getInitialData();
    }

    asJson() {
        return {
            display_name: this.display_name,
            build_number: build_number,
            user_id: this.user_id,
            vbb_name: null,
            session_key: this.session_key,
        };
    }

    pushData(...data: any) {
        this.data.push(...data);
    }

    public SetDisplayName(displayName: string): SessionOptions {
        return (s: Session): void => {
            s.display_name = displayName;
        };
    }

    public static async GetSessionInit(user_id: number) {
        //Get user from DB by comparing ID
        //--IMP!! Will need to eventually verify username + password IMP!!--
        const user = await UserFunctions.getUser(user_id);

        if (user != null) {
            //If a user is found / matched credentials
            var userJson = JSON.parse(JSON.stringify(user));

            //add login count (if successful)
            await UserFunctions.updateUserLoginCount(userJson[0].id);

            const s = new Session();

            s.display_name = userJson[0].username;
            s.user_id = userJson[0].id;

            return s;
        } else {
            return null;
        }
    }
}

var sessions: { [key: string]: Session } = {};

export const sessionHandler = {
    getSessions: (filterFunc: (s: Session, index: number, array: Session[]) => void = (_) => true): Session[] => {
        return (Object.values(sessions) as Session[]).filter(filterFunc);
    },
    addSession: async (user_id: number) => {
        const session = await Session.GetSessionInit(user_id);
        if (session != null) {
            sessions[session.session_key] = session;
            return session.asJson();
        } else {
            return null;
        }
    },
    getSession: (key: string, value: any): Session | undefined => {
        if (key === "session_key") return sessions[value];
        return Object.values(sessions).find((session) => (session as any)[key] === value) as Session;
    },
    removeSession: (session_key: string) => {
        delete sessions[session_key];
    },
};

AuthRouter.post("/login/:http_version", async (req, res) => {
    let data = verify(req.body.steam_id, process.env.JWT_SECRET as string);
    console.log((data as any).discord_id);
    let userData = await sessionHandler.addSession((data as any).discord_id);
    res.json(userData);
});

AuthRouter.post("/logout/:session_key", (req, res) => {
    sessionHandler.removeSession(req.params.session_key);
    res.send();
});
