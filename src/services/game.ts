import { Router } from "express";
import { readFileSync } from "fs";
import { Session } from "./auth/auth";

export const GameRouter = Router();

// request leaderboard or update server of location
GameRouter.post("/leaderboards/:session_key", (req, res) => {
    // parse board_ids and tourney from body
    // and lookup database
    res.json(JSON.parse(readFileSync("./data/lboard.json", "utf-8")));
});

// poll for relevant data
GameRouter.get("/:session_key", (req, res) => {
    let session: Session = (req as any).session;
    // send buffered data and clear
    if (session.data.length > 0) {
        res.json(session.data);
        session.data = [];
    } else {
        res.send();
    }
});

/**
 * Random routes that either have temp data or idk what their purpose is
 */
GameRouter.post("/location/:session_key", (req, res) => {
    // do something here with location info maybe? idk what

    // TODO: start worker for class linked with location eg meadhouse -> worker for roster
    res.send();
});
