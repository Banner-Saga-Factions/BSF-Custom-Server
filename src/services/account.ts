import { Router } from "express";
import { readFileSync } from "node:fs";

export const AccountRouter = Router();

// Used for requesting account info from game launcher
// i.e. when user has no active session

AccountRouter.get("/info/:session_key?", (req, res) => {
    // // look up user in database
    // return user data (will require some handlers for packing data)
    // TODO: implement handlers for packing acc data
    res.json(JSON.parse(readFileSync("./data/acc.json", "utf-8")));
});

AccountRouter.post("/update", (req, res) => {
    let userId = (req as any).userId || (req as any).session.user_id;

    Object.entries(req.body).forEach(([key, value]) => {
        // TODO: update user in database by userid
        console.log(key, value);
    });
    return res.send();
});
