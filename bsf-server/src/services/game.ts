import express from "express";
import { asyncRouter } from "../http/asyncRouter";
import { Session } from "./auth/auth";
import { GAME_LOCATIONS, announceLocation } from "./friends";
import { safeJsonStringify } from "../util/serialization";
import { buildLeaderboards, STATIC_LEADERBOARDS_RAW } from "../db/leaderboard";

export const GameRouter = asyncRouter();

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
                    // These callbacks run on a later tick, outside the middleware stack, so the
                    // catch-all in app.ts cannot answer for them. Reply here, or the game waits
                    // for ever on an open socket (#176).
                    if (!res.writableEnded) res.sendStatus(409);
            } finally {
                finish();
            }
        };

        req.on("close", onClose);

        // 5s long-poll hold — short enough to keep 'dead zones' between requests minimal
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
                    if (!res.writableEnded) res.sendStatus(409);
            } finally {
                finish();
            }
        }, 5000);

        session.once("data", onData);
    }
});

/**
 * The game tells us which room the player has walked into - the great hall, the mead
 * house, a battle - and we show that beside their name on other players' friends
 * screens (#91). Before that list existed there was nobody to show it to, so this route
 * did nothing at all.
 *
 * Two things here are load-bearing, not style:
 *
 *  - The body arrives as plain text, not JSON, because the game stamps that content
 *    type on any request whose body is a bare string. The app-wide JSON parser leaves
 *    req.body as an empty object for those, so without this route's own text parser the
 *    room name never arrives. Same pattern as the chat route.
 *  - The handler replies before it inspects anything, and never refuses. There is
 *    nothing here worth refusing over: the room name is advisory, and a name we do not
 *    recognise is simply dropped, because the string is drawn on other players' screens
 *    and we forward only ones we know. (This is the handler's own behaviour. The
 *    request can still be turned away ahead of it by the session gate or a body parser.)
 */
GameRouter.post("/location/:session_key", express.text(), (req, res) => {
    res.send();

    const session: Session | undefined = (req as any).session;
    const location = typeof req.body === "string" ? req.body.trim() : "";
    // No session: `/services/game/location/11` clears the gate on the login-bypass
    // sentinel with nothing attached. Without this guard the dereference below throws
    // *after* the reply has gone out, which kills the connection.
    if (!session || !GAME_LOCATIONS.has(location) || location === session.location) return;

    session.location = location;
    announceLocation(session.account_id, location);
});
