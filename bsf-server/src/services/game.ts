import { Router } from "express";
import { Session } from "./auth/auth";
import { safeJsonStringify } from "../util/serialization";
import { buildLeaderboards, STATIC_LEADERBOARDS_RAW } from "../db/leaderboard";

export const GameRouter = Router();

// Leaderboards are built live from the DB: real players merged into the
// preserved historical baseline (data/lboard.json), with each requester shown
// their own true value + rank. The client POSTs { tourney_id, board_ids } as
// application/json (parsed by the global express.json() in app.ts). On any DB
// failure we serve the static original board so the page never 500s.
GameRouter.post("/leaderboards/:session_key", async (req, res) => {
    const session: Session = (req as any).session;
    try {
        const tourney_id = Number(req.body?.tourney_id) || 0;
        const board_ids = Array.isArray(req.body?.board_ids) ? req.body.board_ids : undefined;
        const data = await buildLeaderboards(session.account_id, tourney_id, board_ids);
        res.json(data);
    } catch (err) {
        console.error("[GAME] leaderboards build failed; serving static fallback:", err);
        if (STATIC_LEADERBOARDS_RAW) res.json(STATIC_LEADERBOARDS_RAW);
        else res.sendStatus(500);
    }
});

GameRouter.get("/:session_key", (req, res) => {
    let session: Session = (req as any).session;

    session.lastActivity = Date.now();

    if (session.pollingActive) {
        const heldMs = session.pollStartTime ? Date.now() - session.pollStartTime : -1;
        console.log(`[GAME-POLL] 429 for ${session.display_name}: prior poll held ${heldMs}ms (buffered=${session.data.length})`);
        res.sendStatus(429);
        return;
    }

    // Path A: Data is already waiting. Send it immediately and clear buffer.
    if (session.data.length > 0) {
        console.log(`[GAME-POLL] Immediate response: ${session.data.length} buffered messages to ${session.display_name}`);
        res.type("json").send(safeJsonStringify(session.data));
        session.data = [];
    } else {
        // Path B (Long-Polling): Wait for data or timeout after 5 seconds
        session.pollingActive = true;
        session.pollStartTime = Date.now();
        console.log(`[GAME-POLL] START: ${session.display_name} begins polling (will wait up to 5s)`);
        let timer: NodeJS.Timeout;

        const finish = () => {
            session.pollingActive = false;
        };

        const onClose = () => {
            try {
                clearTimeout(timer);
                session.removeListener("data", onData);
            } finally {
                finish();
            }
        };

        const onData = () => {
            try {
                clearTimeout(timer);
                req.removeListener("close", onClose);
                if (res.writableEnded) return;
                const elapsedMs = Date.now() - (session.pollStartTime || Date.now());
                console.log(`[GAME-POLL] ⚡ DATA ARRIVED: ${session.display_name} received in ${elapsedMs}ms (${session.data.length} messages)`);
                res.type("json").send(safeJsonStringify(session.data));
                session.data = [];
            } catch (err) {
                console.error(`[GAME-POLL] onData error for ${session.display_name}:`, err);
            } finally {
                finish();
            }
        };

        req.on("close", onClose);

        // Reduced to 10s to minimize 'dead zones' between requests
        timer = setTimeout(() => {
            try {
                session.removeListener("data", onData);
                req.removeListener("close", onClose);
                const elapsedMs = Date.now() - (session.pollStartTime || Date.now());
                console.log(`[GAME-KEEP-ALIVE] ${session.display_name} refreshed after ${elapsedMs}ms`);

                // Explicitly hint to the client to keep the socket open
                res.set('Connection', 'keep-alive');
                res.json([]);
            } catch (err) {
                console.error(`[GAME-POLL] timer error for ${session.display_name}:`, err);
            } finally {
                finish();
            }
        }, 5000);

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
