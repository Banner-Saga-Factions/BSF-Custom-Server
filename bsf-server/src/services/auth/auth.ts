import crypto from "crypto";
import { readFileSync } from "fs";
import { EventEmitter } from "events";
import { getQueue, dequeuePlayer } from "../queue";
import { GameModes } from "../../const";
import { Router } from "express";
import { config } from "dotenv";
import { AccountRow, upsertAccount } from "../../db/account";

config();

const build_number = readFileSync("./data/build-number", "utf-8");

// 76561197960265728 = 2^56 + 2^52 — exactly representable in IEEE 754.
// All personal Steam IDs are >= this base. Subtracting it gives the 32-bit
// account ID that the game client uses for entity naming and party lookup.
const STEAM_ID_BASE = 76561197960265728;
export const AuthRouter = Router();

// Fix #19: var → const
const generateKey = () => {
    return crypto.randomBytes(8).toString("hex");
};

// LOW-1/LOW-2: cache static files at module load instead of re-reading per request
let _firstJsonData: any[] = [];
try {
    _firstJsonData = JSON.parse(readFileSync("./data/first.json", "utf-8"));
} catch (err) {
    console.error("[AUTH] Failed to load data/first.json:", err);
}

let _accountsData: any[] = [];
try {
    _accountsData = JSON.parse(readFileSync("./data/accounts.json", "utf-8"));
} catch (err) {
    console.error("[AUTH] Failed to load data/accounts.json:", err);
}

export const getInitialData = (): any[] => {
    let initialData: any[] = [];
    for (const type of Object.values(GameModes)) {
        initialData.push(getQueue(type, 0));
    }
    return initialData.concat(_firstJsonData);
};

// Fix #1/#4: return a safe fallback instead of crashing for unknown user_ids
const getUser = (user_id: number): { username: string } => {
    return _accountsData.find((acc) => acc.user_id === user_id) ?? { username: `player_${user_id}` };
};

export class Session extends EventEmitter {
    display_name: string;
    user_id: number;
    steam_id_str: string;  // Exact original string — user_id may lose precision for 17-digit Steam IDs
    // 32-bit account ID used for all in-game data (party.user, entity prefixes, aliveUnits keys).
    // Matches the format the original BSF server used and what the game client expects.
    account_id: number;
    session_key: string;
    accountData: AccountRow | null = null;

    data: any[];
    battle_id?: string;
    match_handle: number = 0;
    pollingActive: boolean = false;
    pollStartTime?: number;  // Timestamp when this poll began (for latency measurement)
    lastActivity: number = Date.now();

    constructor(user_id: number) {
        super();
        this.display_name = getUser(user_id).username;
        this.user_id = user_id;
        this.steam_id_str = String(user_id);
        this.account_id = user_id >= STEAM_ID_BASE ? user_id - STEAM_ID_BASE : user_id;
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
        this.lastActivity = Date.now();
        this.data.push(...data);
        this.emit("data");
    }
}

const sessions: { [key: string]: Session } = {};

const SESSION_TTL_MS = 30 * 60 * 1000;
setInterval(() => {
    const now = Date.now();
    for (const [key, session] of Object.entries(sessions)) {
        if (now - session.lastActivity > SESSION_TTL_MS) {
            if (session.battle_id) {
                const opponent = sessionHandler.getSessions((s) => s.battle_id === session.battle_id && s.session_key !== key)[0];
                if (opponent) {
                    opponent.lastActivity = Date.now();
                    console.log(`[SESSION] Evicted stale session for user_id=${session.user_id} (mid-battle); opponent user_id=${opponent.user_id} TTL reset`);
                } else {
                    console.log(`[SESSION] Evicted stale session for user_id=${session.user_id} (battle=${session.battle_id}, opponent already gone)`);
                }
            } else {
                console.log(`[SESSION] Evicted stale session for user_id=${session.user_id}`);
            }
            session.removeAllListeners();
            dequeuePlayer(key);
            delete sessions[key];
        }
    }
}, 5 * 60 * 1000).unref();

export const sessionHandler = {
    getSessions: (filterFunc: (s: Session, index: number, array: Session[]) => boolean = () => true): Session[] => {
        return (Object.values(sessions) as Session[]).filter(filterFunc);
    },
    addSession: (user_id: number): Session => {
        // HIGH-8: evict any existing session for this user_id to prevent stale sessions
        const existing = Object.values(sessions).find((s) => s.user_id === user_id);
        if (existing) {
            dequeuePlayer(existing.session_key);
            delete sessions[existing.session_key];
        }
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
    // Validate steam_id is a numeric string; keep original string for DB to avoid
    // precision loss — Steam IDs exceed Number.MAX_SAFE_INTEGER (2^53-1).
    const steamIdStr = req.body.steam_id?.toString() ?? "";
    if (!/^\d{1,20}$/.test(steamIdStr)) {
        res.sendStatus(400);
        return;
    }
    // Session uses Number (may lose precision for very large IDs) but DB always
    // receives the original string, so INSERT and SELECT stay in sync.
    const userId = Number(steamIdStr);
    if (String(userId) !== steamIdStr) {
        console.warn(`[AUTH] Steam ID precision loss: received "${steamIdStr}" stored as ${userId} (diff=${BigInt(steamIdStr) - BigInt(userId)})`);
    }

    const session = sessionHandler.addSession(userId);
    // Preserve exact string — used for DB writes (Steam ID must stay exact in the DB)
    session.steam_id_str = steamIdStr;

    // Client sends its Steam display name in display_name — use it if present
    const clientDisplayName = req.body.display_name?.toString().trim();
    if (clientDisplayName) {
        session.display_name = clientDisplayName;
    }

    // Fix #2: wrap DB call in try/catch; clean up session on failure
    try {
        session.accountData = await upsertAccount(steamIdStr, session.display_name);
        // LOW-2: use the DB-stored username as the canonical display name
        session.display_name = session.accountData.username;
        // Send account_id (32-bit) as user_id — matches original server format and avoids
        // entity naming divergence caused by 64-bit Steam IDs in the game client
        res.json({ ...session.asJson(), user_id: session.account_id });
    } catch (err) {
        sessionHandler.removeSession(session.session_key);
        console.error("[LOGIN] DB error during upsertAccount:", err);
        res.sendStatus(500);
    }
});

AuthRouter.post("/logout/:session_key", (req, res) => {
    dequeuePlayer(req.params.session_key);
    sessionHandler.removeSession(req.params.session_key);
    res.send();
});
