import crypto from "crypto";
import { readFileSync } from "fs";
import { getQueue, removePlayerFromQueues } from "../queue";
import { GameModes } from "../../const";
import { Router } from "express";
import { verify } from "jsonwebtoken";
import { config } from "dotenv";
import {
    AccountRecord,
    getAccountRecordById,
    getAccountRecordBySteamId,
    getAccountRecordByUsername,
    listAccountRecords,
} from "../playerData";

config();

const build_number = readFileSync("./data/build-number", "utf-8");
export const AuthRouter = Router();

var generateKey = () => {
    return crypto.randomBytes(8).toString("hex");
};

const getInitialData = (user_id: number): any[] => {
    // should take user_id arg to check currency data and friend data
    // return initial queue data [done], tournament data, currency data, friend data
    let initialData: any[] = [];

    for (const type of Object.values(GameModes)) {
        initialData.push(getQueue(type, user_id));
    }
    const firstData = JSON.parse(readFileSync("./data/first.json", "utf-8"));
    if (Array.isArray(firstData)) {
        initialData.push(...firstData);
    }
    return initialData;
};

export class Session {
    display_name: string;
    user_id: number;
    session_key: string;

    data: any[];
    battle_id?: string; // maybe not needed?
    match_handle: number = 0; // TODO: this is a work around

    constructor(user_id: number, record?: AccountRecord) {
        const accountRecord = record ?? getAccountRecordById(user_id);
        this.display_name = accountRecord?.username ?? `User ${user_id}`;
        this.user_id = user_id;
        this.session_key = generateKey();
        this.data = getInitialData(user_id);
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

var sessions: { [key: string]: Session } = {};

export const sessionHandler = {
    getSessions: (filterFunc: (s: Session, index: number, array: Session[]) => void = (_) => true): Session[] => {
        return (Object.values(sessions) as Session[]).filter(filterFunc);
    },
    addSession: (user_id: number, record?: AccountRecord) => {
        let session = new Session(user_id, record);
        sessions[session.session_key] = session;
        return session.asJson();
    },
    getSession: (key: string, value: any): Session | undefined => {
        if (key === "session_key") return sessions[value];
        return Object.values(sessions).find((session) => (session as any)[key] === value) as Session;
    },
    removeSession: (session_key: string) => {
        delete sessions[session_key];
    },
};

const looksLikeJwt = (value: unknown): value is string => {
    return typeof value === "string" && value.split(".").length === 3;
};

const extractJwtUserId = (token: string): number | undefined => {
    try {
        const payload = verify(token, process.env.JWT_SECRET as string) as any;
        const id = payload?.user_id ?? payload?.discord_id;
        if (typeof id === "number") return id;
        if (typeof id === "string" && /^\d+$/.test(id)) return Number(id);
    } catch (err) {
        console.warn("JWT verification failed, falling back to non-JWT login flow", err);
    }
    return undefined;
};

const coerceNumericId = (value: unknown): number | undefined => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (/^\d+$/.test(trimmed)) {
            return Number(trimmed);
        }
    }
    return undefined;
};

const resolveAccountRecord = (steamField: unknown, usernameField: unknown): AccountRecord | undefined => {
    const candidateSteam = Array.isArray(steamField) ? steamField[0] : steamField;
    const candidateUsername = Array.isArray(usernameField) ? usernameField[0] : usernameField;

    if (typeof candidateSteam === "string" && looksLikeJwt(candidateSteam)) {
        const jwtId = extractJwtUserId(candidateSteam);
        if (typeof jwtId === "number") {
            const record = getAccountRecordById(jwtId);
            if (record) {
                return record;
            }
        }
    }

    const numericId = coerceNumericId(candidateSteam);
    if (typeof numericId === "number") {
        const record = getAccountRecordById(numericId);
        if (record) {
            return record;
        }
    }

    if (typeof candidateSteam === "string") {
        const record = getAccountRecordBySteamId(candidateSteam.trim());
        if (record) {
            return record;
        }
    }

    if (typeof candidateUsername === "string") {
        const record = getAccountRecordByUsername(candidateUsername.trim());
        if (record) {
            return record;
        }
    }

    return undefined;
};

AuthRouter.post("/login/:httpVersion", (req, res) => {
    let accountRecord = resolveAccountRecord(req.body?.steam_id, req.body?.username);

    if (!accountRecord) {
        const fallback = listAccountRecords()[0];
        if (!fallback) {
            res.status(403).send("No accounts configured");
            return;
        }
        console.warn("Unable to resolve login credentials, falling back to first configured account");
        accountRecord = fallback;
    }

    let userData = sessionHandler.addSession(accountRecord.user_id, accountRecord);
    res.json(userData);
});

AuthRouter.post("/logout/:session_key", (req, res) => {
    const session = sessionHandler.getSession("session_key", req.params.session_key);
    if (session) {
        removePlayerFromQueues(session.user_id);
    }
    sessionHandler.removeSession(req.params.session_key);
    res.send();
});
