import { GameRouter } from "./services/game";
import express, { Router } from "express";
import http from "http";
import { AuthRouter, sessionHandler } from "./services/auth/auth";
import { ChatRouter } from "./services/chat";
import { BattleRouter } from "./services/battle/Battle";
import { QueueRouter } from "./services/queue";
import { DownloadRouter } from "./services/download";
import { config } from "dotenv";
import { AccountRouter } from "./services/account";
import { DiscordLoginRouter } from "./services/auth/discord";
import { verify } from "jsonwebtoken";

config();

// CRIT-2: Fail fast at startup if required secrets are absent
if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET environment variable is required");
}
const JWT_SECRET = process.env.JWT_SECRET;

const app = express();
const ServiceRouter = Router();

app.disable("etag");
app.use(express.json());

app.use("/services", ServiceRouter);
app.use("/login/discord", DiscordLoginRouter);

ServiceRouter.use("/", async (req, res, next) => {
    // MED-9: Express strips the /services mount prefix inside ServiceRouter,
    // so the path here starts with /session/..., not /services/session/...
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
            // CRIT-2: verify() throws on bad/expired/tampered tokens — must be in try/catch
            try {
                const decoded = verify(token, JWT_SECRET);
                userId = (decoded as any)?.discord_id;
            } catch {
                // Invalid token — fall through to 403
            }
        }
    }

    // CRIT-1: sendStatus() both sets the status code AND flushes the response body.
    // res.status(403) alone only sets the code and leaves the socket open.
    if (!session && sessionKey !== "11" && !userId) {
        res.sendStatus(403);
        return;
    }

    // CRIT-3: Discord JWT path - create session from userId if not already present
    if (!session && userId) {
        // Discord OAuth verified; create session from JWT payload
        const discordSession = sessionHandler.addSession(parseInt(userId as string, 10));
        try {
            const { getAccountById } = await import("./db/account");
            discordSession.accountData = await getAccountById(parseInt(userId as string, 10));
            (req as any).session = discordSession;
            (req as any).userId = userId;
        } catch (err) {
            console.error("[DISCORD_AUTH] Failed to load account data:", err);
            sessionHandler.removeSession(discordSession.session_key);
            res.sendStatus(500);
            return;
        }
    } else {
        (req as any).session = session;
        (req as any).userId = userId;
    }
    
    app._router.handle(req, res, next);
});

ServiceRouter.use("/auth", AuthRouter);
ServiceRouter.use("/chat", ChatRouter);
ServiceRouter.use("/game", GameRouter);
ServiceRouter.use("/vs", QueueRouter);
ServiceRouter.use("/battle", BattleRouter);
ServiceRouter.use("/download", DownloadRouter);
ServiceRouter.use("/account", AccountRouter);

http.createServer(app).listen(8082, () => {
    console.log("Express server listening on port " + 8082);
});
