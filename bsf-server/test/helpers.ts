import request from "supertest";
import app from "../src/app";
import type { AccountRow } from "../src/db/account";

// Fake DB row returned by the upsertAccount mock in route tests.
// Roster has two units; party references both — keeps /account/update tests realistic.
export const MOCK_ACCOUNT_ROW: AccountRow = {
    user_id: 123,
    username: "testplayer",
    renown: 100,
    daily_login_streak: 1,
    login_count: 5,
    completed_tutorial: true,
    roster_rows: 2,
    roster_json: [
        { id: "unit1", entityClass: "Archer",  stats: [{ stat: "RANK", value: 1 }] },
        { id: "unit2", entityClass: "Warrior", stats: [{ stat: "RANK", value: 2 }] },
    ],
    party_ids_json: ["unit1", "unit2"],
};

// Yield enough event-loop ticks for the async endgame() chain to settle —
// it now awaits a Promise.allSettled (ranking loads), then kicks off a
// Promise.all (writes) → .then(pushData) → .catch(fallback) → tail .catch.
// Counting microtasks by hand is brittle; loop generously instead.
export async function flushEndgame(): Promise<void> {
    for (let i = 0; i < 8; i++) {
        await new Promise<void>((r) => setImmediate(r));
    }
}

// Log in with the given steam_id and return the parsed response body.
// Route tests call this to get a valid session_key before exercising other routes.
export async function loginPlayer(steam_id: string | number = "123") {
    const res = await request(app)
        .post("/services/auth/login/11")
        .send({ steam_id: String(steam_id) });
    return res.body as {
        session_key: string;
        user_id: number;
        display_name: string;
        build_number: string;
    };
}
