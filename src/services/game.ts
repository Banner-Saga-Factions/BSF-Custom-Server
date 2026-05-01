import { Router } from "express";
import { readFileSync } from "fs";
import { Session } from "./auth/auth";
import { safeJsonStringify } from "../util/serialization";

export const GameRouter = Router();

// M-7: cache at module load — file doesn't change without a server restart
let _lboardData: any = null;
try {
    _lboardData = JSON.parse(readFileSync("./data/lboard.json", "utf-8"));
} catch (err) {
    console.error("[GAME] Failed to load data/lboard.json:", err);
}

// request leaderboard or update server of location
GameRouter.post("/leaderboards/:session_key", (req, res) => {
    if (!_lboardData) { res.sendStatus(500); return; }
    res.json(_lboardData);
});

GameRouter.get("/:session_key", (req, res) => {
    let session: Session = (req as any).session;

    session.lastActivity = Date.now();

    if (session.pollingActive) {
        res.sendStatus(429);
        return;
    }

    // Path A: Data is already waiting. Send it immediately and clear buffer.
    if (session.data.length > 0) {
        console.log(`[GAME-POLL] Immediate response: ${session.data.length} buffered messages to ${session.display_name}`);
        res.type("json").send(safeJsonStringify(session.data));
        session.data = [];
    } else {
        // Path B (Long-Polling): Wait for data or timeout after 20 seconds
        session.pollingActive = true;
        session.pollStartTime = Date.now();
        console.log(`[GAME-POLL] START: ${session.display_name} begins polling (will wait up to 20s)`);
        let timer: NodeJS.Timeout;

        const finish = () => {
            session.pollingActive = false;
        };

        const onData = () => {
            clearTimeout(timer);
            const elapsedMs = Date.now() - (session.pollStartTime || Date.now());
            console.log(`[GAME-POLL] ⚡ DATA ARRIVED: ${session.display_name} received in ${elapsedMs}ms (${session.data.length} messages)`);
            res.type("json").send(safeJsonStringify(session.data));
            session.data = [];
            finish();
        };

        // Reduced to 10s to minimize 'dead zones' between requests
        timer = setTimeout(() => {
            session.removeListener("data", onData);
            const elapsedMs = Date.now() - (session.pollStartTime || Date.now());
            console.log(`[GAME-KEEP-ALIVE] ${session.display_name} refreshed after ${elapsedMs}ms`);
            
            // Explicitly hint to the client to keep the socket open
            res.set('Connection', 'keep-alive');
            res.json([]);
            finish();
        }, 10000);

        session.once("data", onData);
    }
});

/**
 * Random routes that either have temp data or idk what their purpose is
 */
GameRouter.post("/location/:session_key", (req, res) => {
    // do something here with location info maybe? idk what

    // TODO: start worker for class linked with location eg meadhouse -> worker for roster
    res.send();
});
