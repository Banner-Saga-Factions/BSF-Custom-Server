import { GameRouter } from "./services/game";
import express, { Router } from "express";
import { AuthRouter, sessionHandler } from "./services/auth/auth";
import { ChatRouter } from "./services/chat";
import { BattleRouter, setDebugPartyLimit, setDebugWeakUnits } from "./services/battle/Battle";
import { QueueRouter } from "./services/queue";
import { DownloadRouter } from "./services/download";
import { config } from "dotenv";
import { AccountRouter } from "./services/account";
import { RosterRouter } from "./services/roster";
import { DiscordLoginRouter } from "./services/auth/discord";
import { verify } from "jsonwebtoken";

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

    app.post("/debug/weak-units", (req, res) => {
        const enabled = req.body?.enabled === true;
        setDebugWeakUnits(enabled);
        console.log(`[DEBUG] weak units ${enabled ? "ON" : "OFF"}`);
        res.send();
    });
}

ServiceRouter.use("/", (req, res, next) => {
    if (req.path.startsWith("/session/steam/overlay/")) {
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

export default app;
