import crypto from "crypto";
import { readFileSync } from "fs";
import { EventEmitter } from "events";
import { getQueue } from "../queue";
import { GameModes } from "../../const";
import { Router } from "express";
import { config } from "dotenv";
import { AccountRow, upsertAccount } from "../../db/account";

config();

const build_number = readFileSync("./data/build-number", "utf-8");
export const AuthRouter = Router();

// Fix #19: var → const
const generateKey = () => {
    return crypto.randomBytes(8).toString("hex");
};

const getInitialData = (): any[] => {
    let initialData: any[] = [];
    for (const type of Object.values(GameModes)) {
        initialData.push(getQueue(type, 0));
    }
    // Fix #5: concat returns a new array — reassign to capture it
    initialData = initialData.concat(JSON.parse(readFileSync("./data/first.json", "utf-8")));
    return initialData;
};

// Fix #1/#4: return a safe fallback instead of crashing for unknown user_ids
const getUser = (user_id: number): { username: string } => {
    try {
        const accounts: any[] = JSON.parse(readFileSync("./data/accounts.json", "utf-8"));
        return accounts.find((acc) => acc.user_id === user_id) ?? { username: `player_${user_id}` };
    } catch {
        return { username: `player_${user_id}` };
    }
};

export class Session extends EventEmitter {
    display_name: string;
    user_id: number;
    session_key: string;
    accountData: AccountRow | null = null;

    data: any[];
    battle_id?: string;
    match_handle: number = 0;

    constructor(user_id: number) {
        super();
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
        this.emit("data");
    }
}

// Fix #19: var → const
const sessions: { [key: string]: Session } = {};

export const sessionHandler = {
    getSessions: (filterFunc: (s: Session, index: number, array: Session[]) => void = (_) => true): Session[] => {
        return (Object.values(sessions) as Session[]).filter(filterFunc);
    },
    addSession: (user_id: number): Session => {
        const session = new Session(user_id);
        sessions[session.session_key] = session;
        return session;
    },
    getSession: (key: string, value: any): Session | undefined => {
        if (key === "session_key") return sessions[value];
        return Object.values(sessions).find((session) => (session as any)[key] === value) as Session;
    },
    removeSession: (session_key: string) => {
        delete sessions[session_key];
    },
};

AuthRouter.post("/login/:httpVersion", async (req, res) => {
    // Fix #14: parse with radix and guard against NaN
    const userId = parseInt(req.body.steam_id, 10);
    if (isNaN(userId) || userId <= 0) {
        res.sendStatus(400);
        return;
    }

    const session = sessionHandler.addSession(userId);

    // Fix #2: wrap DB call in try/catch; clean up session on failure
    try {
        session.accountData = await upsertAccount(userId, session.display_name);
        res.json(session.asJson());
    } catch (err) {
        sessionHandler.removeSession(session.session_key);
        console.error("[LOGIN] DB error during upsertAccount:", err);
        res.sendStatus(500);
    }
});

AuthRouter.post("/logout/:session_key", (req, res) => {
    sessionHandler.removeSession(req.params.session_key);
    res.send();
});
