import { Router } from "express";
import { getAccountData, saveAccountData } from "./playerData";

export const AccountRouter = Router();

// Used for requesting account info from game launcher
// i.e. when user has no active session

AccountRouter.get("/info/:session_key?", (req, res) => {
    const session = (req as any).session;
    const userId = (req as any).userId ?? session?.user_id;
    if (!userId) {
        res.status(403).send("Missing user context");
        return;
    }

    // look up user in database
    // return user data (will require some handlers for packing data)
    res.json(getAccountData(userId));
});

AccountRouter.post("/update", (req, res) => {
    const session = (req as any).session;
    let userId = (req as any).userId || session?.user_id;
    if (!userId) {
        res.status(403).send("Missing user context");
        return;
    }

    const current = getAccountData(userId);
    const updated = { ...current };
    Object.entries(req.body ?? {}).forEach(([key, value]) => {
        (updated as any)[key] = value;
    });

    saveAccountData(userId, updated);
    return res.send();
});
