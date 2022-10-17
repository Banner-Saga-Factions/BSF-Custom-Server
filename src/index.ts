import express from 'express';
import { readFileSync } from 'fs';
import http from "http";
import { mqttPublish, mqttClient } from './mqtt';
import { ChatMessage } from './chat';
import { sessionHandler } from './sessions';

const app = express();

app.disable('etag');
app.use(express.json());

// auth
app.post('/services/auth/:action/:session_key', (req, res) => {
    if (req.params.action === 'login') {

        let userData;
        if (req.body.username === "test") {
            userData = sessionHandler.addSession("test", "test");
        }
        else {
            // see note in getUserId() above
            userData = sessionHandler.addSession("test", "test");
        };

        res.json(userData.asJson());

    } else if (req.params.action === 'logout') {
        sessionHandler.removeSession(req.params.session_key);
        res.send();
    }

});

// get account info
app.get("/services/account/info/:session_key", (req, res) => {
    let session = sessionHandler.getSession(req.params.session_key);
    if (!session) res.sendStatus(404);
    else {
        // console.log(session.user_id); // <- look up user in database 
        // return user data
        res.json(JSON.parse(readFileSync("./data/acc.json", 'utf-8')));
    }
})

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

app.get("/services/game/:session_key", (req, res) => {
    let session = sessionHandler.getSession(req.params.session_key);
    if (!session) res.sendStatus(404);
    else {
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

app.post("/services/session/steam/overlay/:session_key/:state", (req, res) => {
    // idk what the server does with this info
    res.send();
})

app.post("/services/chat/:room/:session_key", express.text(), (req, res) => {
    let session = sessionHandler.getSession(req.params.session_key);
    if (!session) res.sendStatus(404);
    else {
        let chat: ChatMessage = {
            "class": "tbs.srv.chat.ChatMsg",
            "msg": req.body,
            "room": req.params.room,
            "user": session.user_id,
            "username": session.display_name
        }
        mqttPublish(req.url.split(/\/services\/(.*)/s, 2)[1], chat);
    }
    res.send();
});

http.createServer(app).listen(3000);