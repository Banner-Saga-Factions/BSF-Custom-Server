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

const app = express();
const ServiceRouter = Router();

app.disable("etag"); // disables caching responses
app.use(express.json()); // parse data as json unless otherwise specified

app.use("/services", ServiceRouter);
app.use("/login/discord", DiscordLoginRouter);

/**
 * All requests to the server after login end the url with a session key,
 * [with the exception of steam/overlay/{session_id}/{state}]. This middleware
 * extracts the session key and checks it is a valid session before continuing.
 **/
ServiceRouter.use("/", (req, res, next) => {
    // steam overlay requests dont end with the session key but the server
    // doesnt seem to do anything with the request anyway so skip check
    if (req.path.startsWith("/services/session/steam/overlay/")) {
        res.send();
        return;
    }

    // get session key from url
    let sessionKey = req.path.substring(req.path.lastIndexOf("/") + 1);
    // search for corresponding session object
    let session = sessionHandler.getSession("session_key", sessionKey);

    let userId: string | undefined;
    if (!session) {
        const token = req.headers.authorization?.match(/Bearer (.*)/)?.[1];
        // TODO: verify token
        if (token) {
            const decodedToken = verify(token, process.env.JWT_SECRET as string);
            userId = (decodedToken as any)?.discord_id;
            // TODO: Use the userId for further processing
        }
    }
    // if no session found return unauthorised
    // the login route ends with /11 so in that case the user has no session
    // and the extracted "key" will be 11, so in this case the request can continue
    if (!session && sessionKey !== "11" && !userId) {
        res.status(403);
        return;
    }

    // adding the session object to the request object so
    // each module doesn't need to lookup the session again
    (req as any).session = session;
    (req as any).userId = userId;
    app._router.handle(req, res, next);
});

ServiceRouter.use("/auth", AuthRouter);

ServiceRouter.use("/chat", ChatRouter);

ServiceRouter.use("/vs", QueueRouter);

ServiceRouter.use("/battle", BattleRouter);

ServiceRouter.use("/download", DownloadRouter);

ServiceRouter.use("/account", AccountRouter);

http.createServer(app).listen(8082, () => {
    console.log("Express server listening on port " + 8082);
});
