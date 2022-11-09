import { sessionHandler, Session } from './sessions';
import { ServerClasses } from './const'
import { battleHandler } from './battle/Battle';
import express from "express";

type ChatMessage = {
    "class": ServerClasses;
    "msg": string;
    "room": string;
    "user": number;
    "username": string;
};

export const ChatRouter = express.Router();

ChatRouter.post('/:room/:session_key', express.text(), (req, res) => {
    res.send();
    let session = (req as any).session
    let msg: ChatMessage = {
        class: ServerClasses.CHAT_MESSAGE,
        msg: req.body,
        room: req.params.room,
        user: session.user_id,
        username: session.display_name
    }
    if (req.params.room === "global") {
        sessionHandler.getSessions().forEach((session: Session) => {
            session.pushData(msg);
        });
    } else if (session.battle_id) {
        battleHandler.getBattle(session.battle_id)?.parties
        .forEach(party =>
            party.pushData(msg)
        );
    };
})

