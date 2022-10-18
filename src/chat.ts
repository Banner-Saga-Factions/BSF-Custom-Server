import { sessionHandler, Session } from './sessions';

type ChatMessage = {
    "class": "tbs.srv.chat.ChatMsg";
    "msg": string;
    "room": string;
    "user": number;
    "username": string;
};

export const chatMessageCallback = (room: string, session: Session, message: string) => {
    let msg: ChatMessage = {
        class: "tbs.srv.chat.ChatMsg",
        msg: message,
        room: room,
        user: session.user_id,
        username: session.display_name
    }
    sessionHandler.getSessions().forEach((session: Session) => {
        if (room === "global" || session.battle_id === room)
            session.pushData(msg);
    })
}