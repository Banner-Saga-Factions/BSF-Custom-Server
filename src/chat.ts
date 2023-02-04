import { sessionHandler, Session } from './sessions';
import { ServerClasses } from './const'
import { Battle, battleHandler } from './battle/Battle';
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
    let session: Session = (req as any).session
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
        let battle: Battle | undefined = battleHandler.getBattle(session.battle_id);
        if (!battle) return;

        sessionHandler.getSessions((s) => {
            Object.keys(battle?.parties).includes(s.session_key)
        })?.forEach(s => s.pushData(msg))
    };
})

