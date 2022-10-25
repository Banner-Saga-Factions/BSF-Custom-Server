import { sessionHandler, Session } from './sessions';
import { ServerClasses } from './const'
import { battleHandler } from './battle/Battle';

type ChatMessage = {
    "class": ServerClasses;
    "msg": string;
    "room": string;
    "user": number;
    "username": string;
};

export const chatMessageCallback = (room: string, session: Session, message: string) => {
    let msg: ChatMessage = {
        class: ServerClasses.CHAT_MESSAGE,
        msg: message,
        room: room,
        user: session.user_id,
        username: session.display_name
    }
    if (room === "global") {
        sessionHandler.getSessions().forEach((session: Session) => {
            session.pushData(msg);
        })
    } else if (session.battle_id){
        let opp = battleHandler.getBattle(session.battle_id)?.parties
        .find(id=>id!==session.user_id)
        sessionHandler.getSession("user_id", opp)?.pushData(msg)
        
    };
    
}