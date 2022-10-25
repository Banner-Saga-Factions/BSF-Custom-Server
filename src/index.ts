import express from 'express';
import { readFileSync } from 'fs';
import http from "http";
import { mqttClient } from './mqtt';
import { sessionHandler } from './sessions';
import { ServerClasses } from './const';

const app = express();

app.disable('etag'); // disables caching responses
app.use(express.json()); // parse data as json unless specified

const isSessionValid = (session_key: string, res: any) => {
    let session = sessionHandler.getSession(session_key);
    if (!session) {
        res.sendStatus(404);
        return null;
    }
    return session
}

// auth
app.post('/services/auth/:action/:session_key', (req, res) => {
    if (req.params.action === 'login') {
        let userData = sessionHandler.addSession(req.body.steam_id)
        res.json(userData);

    } else if (req.params.action === 'logout') {
        sessionHandler.removeSession(req.params.session_key);
        res.send();
    }

});

// get account info
app.get("/services/account/info/:session_key", (req, res) => {
    let session = isSessionValid(req.params.session_key, res)
    if (session) {
        // look up user in database 
        // return user data (will require some handlers for packing data)
        // TODO: implement handlers for packing acc data
        res.json(JSON.parse(readFileSync("./data/acc.json", 'utf-8')));
    }
})

// request leaderboard or update server of location
app.post("/services/game/:action/:session_key", (req, res) => {
    let action = req.params.action;
    if (action === "leaderboards") {
        // parse board_ids and tourney from body 
        // and lookup database
        res.json(JSON.parse(readFileSync("./data/lboard.json", 'utf-8')));
    }
    else if (action === "location") {
        let user = sessionHandler.getSession(req.params.session_key);
        if (!user) res.sendStatus(404);
        else {
            // do something here with location info maybe? idk what
            res.sendStatus(200);
        };
    };
});

// poll for relevant data
app.get("/services/game/:session_key", (req, res) => {
    let session = isSessionValid(req.params.session_key, res)
    if (session) {
        // send buffered data and clear
        // console.log(session.data);
        if (session.data.length > 0) {
            res.json(session.data);
            session.data = [];
        }
        else {
            res.send();
        }
    }
})

// notify server if steam overlay is enabled
app.post("/services/session/steam/overlay/:session_key/:state", (req, res) => {
    // idk what the server does with this info
    res.send();
})

// send chat message
app.post("/services/chat/:room/:session_key", express.text(), (req, res) => {
    let session = isSessionValid(req.params.session_key, res)
    if (session) {
        mqttClient.publish(req.url.split(/\/services\/(.*)/s, 2)[1], req.body);
    }
    res.send();
});


// join or leave game queue
app.post("/services/vs/:action/:session_key", (req, res) => {
    let session = isSessionValid(req.params.session_key, res)
    if (session) {
        let topic = req.url.split(/\/services\/(.*)/s, 2)[1]
        switch (req.params.action) {
            case "start":
                mqttClient.publish(topic, req.body.vs_type);
                res.json({
                    class: ServerClasses.SERVER_STATUS_DATA,
                    session_count: sessionHandler.getSessions().length,
                });
                break;
            case "cancel":
                mqttClient.publish(topic, "");
                res.send();
                break;
        }
    }
})

http.createServer(app).listen(3000);