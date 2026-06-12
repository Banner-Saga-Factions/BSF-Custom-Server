import { GameRouter } from "./services/game";
import express, { Router } from "express";
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

const ServiceRouter = Router();

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

    app.post("/debug/renown", async (req, res) => {
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
        await addRenown(session.steam_id_str, amount);
        session.accountData.renown += amount;
        console.log(`[DEBUG] renown for account_id=${session.account_id} → ${session.accountData.renown} (delta ${amount > 0 ? "+" : ""}${amount})`);
        res.json({ renown: session.accountData.renown });
    });
}

// Issue #55: only the exact captured shape is allowed to skip auth.
// Form: /session/steam/overlay/<session_key>/<true|false> (Steam overlay open/close).
// Express strips /services before this middleware, so the regex anchors on /session/...
const STEAM_OVERLAY_RE = /^\/session\/steam\/overlay\/[A-Za-z0-9]+\/(true|false)$/;

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
                // Invalid token — fall through to 403
            }
        }
    }

    if (!session && sessionKey !== "11" && !userId) {
        res.sendStatus(403);
        return;
    }

    // Raw Discord JWT is not valid for game traffic. Must be exchanged for a
    // session_key via POST /login/discord/session, then use the session_key like Steam.
    if (!session && userId) {
        res.sendStatus(501);
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

export default app;
