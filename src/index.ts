import express from 'express';
import { readFileSync } from 'fs';
import http from "http";
import { AuthRouter, sessionHandler } from './sessions';
import { ServerClasses } from './const';
import { ChatRouter } from './chat';
import { BattleRouter } from './battle/Battle';
import { QueueRouter } from './queue';

const app = express();

app.disable('etag'); // disables caching responses
app.use(express.json()); // parse data as json unless otherwise specified

app.use((req, res, next) => {
    if (req.path.startsWith("/services/session/steam/overlay/")) {
        next();
        return;
    };
    let session_key = req.path.substring(req.path.lastIndexOf("/") + 1)
    let session = sessionHandler.getSession("session_key", session_key);
    if (!session && session_key !== "11") {
        res.sendStatus(403);
        return;
    }
    //@ts-ignore
    req.session = session;
    next();
});


app.use("/services/auth", AuthRouter);

app.use("/services/chat", ChatRouter);

app.use("/services/vs", QueueRouter);

app.use("/services/battle", BattleRouter);

// request leaderboard or update server of location
app.post("/services/game/leaderboards/:session_key", (req, res) => {
    // parse board_ids and tourney from body 
    // and lookup database
    res.json(JSON.parse(readFileSync("./data/lboard.json", 'utf-8')));
});

// poll for relevant data
app.get("/services/game/:session_key", (req, res) => {
    let session = (req as any).session
    // send buffered data and clear
    if (session.data.length > 0) {
        res.json(session.data);
        session.data = [];
    }
    else {
        res.send();
    }
});

/**
 * Random routes that either have temp data or idk what their purpose is
 */

// get account info
app.get("/services/account/info/:session_key", (req, res) => {
    // // look up user in database 
    // return user data (will require some handlers for packing data)
    // TODO: implement handlers for packing acc data
    res.json(JSON.parse(readFileSync("./data/acc.json", 'utf-8')));

})

app.post("/services/game/location/:session_key", (req, res) => {
    // do something here with location info maybe? idk what
    res.send();
});

// notify server if steam overlay is enabled
app.post("/services/session/steam/overlay/:session_key/:state", (req, res) => {
    // idk what the server does with this info
    res.send();
})

http.createServer(app).listen(3000);