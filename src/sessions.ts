import crypto from "crypto";
import { readFileSync } from "fs";
import { getQueue } from "./queue";
import { GameModes } from "./const";
import { Router } from "express";
import jsonwebtoken from "jsonwebtoken";
const { verify, sign } = jsonwebtoken;
import * as d_auth from "./auth/discord";
import { config } from "dotenv";

config();

const build_number = readFileSync("./data/build-number", "utf-8");
export const AuthRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET as string;

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

const getUser = (user_id: number) => {
    // look up user in database and return data
    // needs some form of authentication
    // maybe a user_id stored in a jwt token
    // which can be passed as the username to the game from an external client
    // anyway... on with the demo
    return JSON.parse(readFileSync("./data/accounts.json", "utf-8")).find(
        (acc: any) => acc.user_id === user_id
    );
};

export class Session {
    display_name: string;
    user_id: number;
    session_key: string;

    data: any[];
    battle_id?: string; // maybe not needed?
    match_handle: number = 0; // TODO: this is a work around

    constructor(user_id: number) {
        this.display_name = getUser(user_id).username;
        this.user_id = user_id;
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
}

var sessions: any = {};

export const sessionHandler = {
    getSessions: (
        filterFunc: (s: Session, index: number, array: Session[]) => void = (
            _
        ) => true
    ): Session[] => {
        return (Object.values(sessions) as Session[]).filter(filterFunc);
    },
    addSession: (user_id: number) => {
        let session = new Session(user_id);
        sessions[session.session_key] = session;
        return session.asJson();
    },
    getSession: (key: string, value: any): Session => {
        if (key === "session_key") return sessions[value];
        return Object.values(sessions).find(
            (session) => (session as any)[key] === value
        ) as Session;
    },
    removeSession: (session_key: string) => {
        delete sessions[session_key];
    },
};

AuthRouter.post("/login/:httpVersion", (req, res) => {
    let data = verify(req.body.steam_id, process.env.JWT_SECRET as string);
    console.log(data); // Temporary
    // TODO: lookup user in database
    let userData = sessionHandler.addSession(293850);
    res.json(userData);
});

AuthRouter.post("/logout/:session_key", (req, res) => {
    sessionHandler.removeSession(req.params.session_key);
    res.send();
});

AuthRouter.get("/discord-login", (req, res) => {
    res.redirect(d_auth.getDiscordOAuthURL());
});

AuthRouter.get("/discord-oauth-callback", async (req, res) => {
    let jwt_res: string | undefined;
    let error: string | undefined;

    if (req.query?.error || !req.query?.code) {
        error = req.query.error?.toString();
    }
    try {
        const tokens = await d_auth.getDiscorOauthToken(
            req.query.code as string
        );
        const d_user = await d_auth.getDiscordUser(tokens.access_token);
        jwt_res = sign({ discord_id: d_user.id }, JWT_SECRET);
    } catch (e) {
        console.log(e); // TODO: Should probably log this somewhere persistent
        error = "an_error_occurred_communicating_with_discord";
    }
    res.status(301);
    if (error) {
        return res.redirect(`bsf://auth?error=${error}`);
    }
    return res.redirect(`bsf://auth?access_token=${jwt_res}`);
});
