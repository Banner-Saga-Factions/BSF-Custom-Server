import { Router } from "express";
import { readFileSync } from "fs";
import { Session } from "./auth/auth";

export const GameRouter = Router();

// request leaderboard or update server of location
GameRouter.post("/leaderboards/:session_key", (req, res) => {
    // parse board_ids and tourney from body
    // and lookup database
    try {
        res.json(JSON.parse(readFileSync("./data/lboard.json", "utf-8")));
    } catch {
        res.sendStatus(500);
    }
});

// poll for relevant data
GameRouter.get("/:session_key", (req, res) => {
    let session: Session = (req as any).session;

    // MED-7: reject concurrent polls — second request would steal data from the first
    if (session.pollingActive) {
        res.sendStatus(429);
        return;
    }

    // Path A: Data is already waiting. Send it immediately and clear buffer.
    if (session.data.length > 0) {
        console.log(`[GAME] Returning ${session.data.length} buffered messages to session ${session.session_key}`);
        res.json(session.data);
        session.data = [];
    } else {
        // Path B (Long-Polling): Wait for data or timeout after 20 seconds
        session.pollingActive = true;
        console.log(`[GAME] Long-polling started for session ${session.session_key}`);
        let timer: NodeJS.Timeout;

        const finish = () => {
            session.pollingActive = false;
        };

        const onData = () => {
            clearTimeout(timer);
            console.log(`[GAME] Data received for session ${session.session_key}, sending ${session.data.length} messages`);
            res.json(session.data);
            session.data = [];
            finish();
        };

        // If 20 seconds pass, give up and return empty array to keep connection alive
        timer = setTimeout(() => {
            session.removeListener("data", onData);
            console.log(`[GAME] Timeout waiting for data on session ${session.session_key}`);
            res.json([]);
            finish();
        }, 20000);

        // Listen for the "data" event from pushData()
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
