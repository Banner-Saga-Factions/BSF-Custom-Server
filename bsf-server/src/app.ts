import { GameRouter } from "./services/game";
import express, { NextFunction, Request, Response } from "express";
import { asyncRouter, wrapAsync } from "./http/asyncRouter";
import { AuthRouter, sessionHandler } from "./services/auth/auth";
import { ChatRouter } from "./services/chat";
import { BattleRouter, setDebugFastTimer, setDebugPartyLimit } from "./services/battle/Battle";
import { QueueRouter } from "./services/queue";
import { DownloadRouter } from "./services/download";
import { config } from "dotenv";
import { AccountRouter } from "./services/account";
import { RosterRouter } from "./services/roster";
import { LobbyRouter } from "./services/lobby";
import { DiscordLoginRouter } from "./services/auth/discord";
import { verify } from "jsonwebtoken";
import { addRenown } from "./db/account";

config();

// Fail fast at startup if required secrets are absent
if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET environment variable is required");
}
const JWT_SECRET = process.env.JWT_SECRET;

const app = express();

app.use((req, res, next) => {
    res.socket?.setNoDelay(true);
    next();
});

const ServiceRouter = asyncRouter();

app.disable("etag");
app.use(express.json());

app.get("/health", (_req, res) => {
    res.json({ status: "ok", uptime: Math.floor(process.uptime()) });
});

app.use("/services", ServiceRouter);
app.use("/login/discord", DiscordLoginRouter);

// Debug-only: blocked in production (C-3 — unauthenticated, game-integrity risk)
if (process.env.NODE_ENV !== "production") {
    app.post("/debug/party-limit", (req, res) => {
        const limit = req.body?.limit;
        setDebugPartyLimit(typeof limit === "number" ? limit : null);
        console.log(`[DEBUG] party limit set to ${limit ?? "none"}`);
        res.send();
    });

    app.post("/debug/fast-timer", (req, res) => {
        const enabled = req.body?.enabled === true;
        setDebugFastTimer(enabled);
        console.log(`[DEBUG] fast timer ${enabled ? "ON" : "OFF"}`);
        res.send();
    });

    app.post("/debug/renown", wrapAsync(async (req, res) => {
        const { session_key, account_id, amount } = req.body ?? {};
        if (typeof amount !== "number") {
            res.status(400).json({ error: "amount must be a number" });
            return;
        }
        const session = session_key
            ? sessionHandler.getSession("session_key", session_key)
            : sessionHandler.getSession("account_id", Number(account_id));
        if (!session || !session.accountData) {
            res.status(404).json({ error: "session not found — provide session_key or account_id of a logged-in player" });
            return;
        }
        await addRenown(session.external_id_str, amount);
        session.accountData.renown += amount;
        console.log(`[DEBUG] renown for account_id=${session.account_id} → ${session.accountData.renown} (delta ${amount > 0 ? "+" : ""}${amount})`);
        res.json({ renown: session.accountData.renown });
    }));
}

// Issue #55: only the exact captured shape is allowed to skip auth.
// Form: /session/steam/overlay/<session_key>/<true|false> (Steam overlay open/close).
// Express strips /services before this middleware, so the regex anchors on /session/...
const STEAM_OVERLAY_RE = /^\/session\/steam\/overlay\/[A-Za-z0-9]+\/(true|false)$/;

// A real session key is 32 hex characters (auth.ts -> crypto.randomBytes(16)). The gate needs
// to tell "a session we no longer know" apart from "the last path segment was never a session
// key", because those two deserve different answers -- see the fallthrough below.
const SESSION_KEY_RE = /^[0-9a-f]{32}$/;

ServiceRouter.use("/", (req, res, next) => {
    if (STEAM_OVERLAY_RE.test(req.path)) {
        res.send();
        return;
    }

    const sessionKey = req.path.substring(req.path.lastIndexOf("/") + 1);
    const session = sessionHandler.getSession("session_key", sessionKey);

    let userId: string | undefined;
    if (!session) {
        const token = req.headers.authorization?.match(/Bearer (.*)/)?.[1];
        if (token) {
            try {
                const decoded = verify(token, JWT_SECRET);
                userId = (decoded as any)?.discord_id;
            } catch {
                // Invalid token — fall through to the check below
            }
        }
    }

    if (!session && sessionKey !== "11" && !userId) {
        // 401 is the one answer the game reads as "you are logged out": it abandons the
        // request, marks itself offline, shows a "Disconnected From Server" dialog and, once the
        // player clicks OK, re-acquires credentials -- signing straight back in when it holds a
        // Steam ticket, and showing the login screen when it does not (measured 2026-08-25).
        // 403 reaches no branch there at all, so the game treats it as an ordinary failure, so after a restart the player sat behind a network-problem
        // banner for ever, with every button dead (#180).
        //
        // Which is exactly why we may only say it when a session key was actually presented.
        // The unit-variation route puts a lobby id in the last segment, so we read a number
        // here and find no session even though the player is perfectly healthy (#188, and
        // docs/client-contract.md -> R5). Answering 401 there would sign them out for
        // recolouring a unit. Keep 403 for anything that was never a session key at all: it still
        // trips the connection-health banner like any other failure, but it never signs anyone out.
        res.sendStatus(SESSION_KEY_RE.test(sessionKey) ? 401 : 403);
        return;
    }

    // Raw Discord JWT is not valid for game traffic. Must be exchanged for a
    // session_key via POST /login/discord/session, then use the session_key like Steam.
    //
    // 409, NOT 501: the client auto-resends on any code >= 500 (plus 0 and 404) every
    // 1-2 s with no attempt cap (HttpAction.canRetry), so answering
    // 501 here put every unexchanged-token request into a permanent retry loop. This is
    // a *permanent* condition until the client exchanges the token, so it must use a
    // code the client does not retry. See docs/client-contract.md -> R10.
    if (!session && userId) {
        res.sendStatus(409);
        return;
    }

    (req as any).session = session;
    (req as any).userId = userId;
    app._router.handle(req, res, next);
});

ServiceRouter.use("/auth", AuthRouter);
ServiceRouter.use("/chat", ChatRouter);
ServiceRouter.use("/game", GameRouter);
ServiceRouter.use("/vs", QueueRouter);
ServiceRouter.use("/battle", BattleRouter);
ServiceRouter.use("/download", DownloadRouter);
ServiceRouter.use("/account", AccountRouter);
ServiceRouter.use("/roster", RosterRouter);
ServiceRouter.use("/lobby", LobbyRouter);

// ------------------------------------------------------------------------------------------
// Last line of defence: every request gets a reply.
//
// Registered after every route, so anything that throws -- or, now that the routers above are
// asyncRouters, anything that fails a moment later -- ends up here instead of leaving the game
// waiting on a socket that is never going to answer. Issue #176.
// ------------------------------------------------------------------------------------------
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const session = (req as any).session;
    const who = session
        ? `${session.display_name} (account_id=${session.account_id})`
        : "no session";
    console.error(`[UNCAUGHT] ${req.method} ${req.originalUrl} - ${who} - ${err?.message ?? err}`);
    if (err?.stack) console.error(err.stack);

    // Something already replied. chat.ts sends on its first statement and keeps working
    // afterwards; game.ts clears its buffer after sending. Writing a second time throws
    // ERR_HTTP_HEADERS_SENT and lose the reply the player already had. Hand back to Express instead;\n    // finalhandler destroys the socket, which is harmless once the response has been sent.
    if (res.headersSent) {
        next(err);
        return;
    }

    // Keep a status the error itself carries, so express.json()'s "malformed body" stays a 400
    // rather than quietly becoming something else. Everything else answers 409.
    //
    // Two codes are excluded from the pass-through. The game re-sends 404 and anything >= 500
    // every 1-2 s with no attempt cap (HttpAction.canRetry). And 401 is worse than either: it
    // signs the player out. A dependency that carries status 401 must not be able to do that
    // through a route that never looked at anyone's session key. See docs/client-contract.md -> R10.
    const carried = Number(err?.status ?? err?.statusCode);
    const status =
        Number.isInteger(carried) && carried >= 400 && carried < 500 && carried !== 404 && carried !== 401
            ? carried
            : 409;
    res.sendStatus(status);
});

export default app;
