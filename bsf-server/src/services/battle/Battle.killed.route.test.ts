import { describe, it, expect, afterEach, vi } from "vitest";
import request from "supertest";
import app from "../../app";
import { sessionHandler, Session } from "../auth/auth";
import { battleHandler } from "./Battle";
import { GameModes, ServerClasses } from "../../const";

describe("POST /battle/killed reliable_msg_id format (issue #20)", () => {
    // Guards the original Stoic wire format:
    //   ${battle_id}_killed_${reporterAccountId}_${killedparty}_${entity}
    // (BattleKilledData.java:17; captures 0411_s.txt / 0431_s.txt). A non-terminal
    // kill (victim keeps a unit) avoids the DB-writing endgame() path.
    let battleId: string | undefined;
    const sessionKeys: string[] = [];

    function makeSession(userId: number, units: string[]): Session {
        const s = sessionHandler.addSession(userId);
        sessionKeys.push(s.session_key);
        s.accountData = {
            roster_json: units.map((id) => ({ id, stats: [{ stat: "RANK", value: 1 }] })),
            party_ids_json: units,
        } as any;
        return s;
    }

    afterEach(() => {
        if (battleId) battleHandler.removeBattle(battleId);
        battleId = undefined;
        sessionKeys.splice(0).forEach((k) => sessionHandler.removeSession(k));
        vi.restoreAllMocks();
    });

    it("includes the reporter's account_id before killedparty", async () => {
        const reporter = makeSession(1001, ["a1", "a2"]); // does the killing
        const victim = makeSession(2002, ["b1", "b2"]);   // owns the killed unit

        const battle = battleHandler.addBattle(
            [reporter, victim],
            GameModes.QUICK,
            [{ power: 0, elo: 0 }, { power: 0, elo: 0 }],
        );
        battleId = battle.battle_id;

        const spy = vi.spyOn(victim, "pushData"); // opponent receives the killed push

        await request(app)
            .post(`/services/battle/killed/${reporter.session_key}`)
            .send({
                battle_id: battle.battle_id,
                killedparty: victim.account_id,
                killerparty: reporter.account_id,
                entity: "b1",   // non-terminal: victim still has b2
                killer: "a1",
                turn: 3,
                ordinal: 0,
            })
            .expect(200);

        const killMsg: any = spy.mock.calls
            .flat()
            .find((m: any) => m?.class === ServerClasses.BATTLE_KILLED_DATA);

        expect(killMsg).toBeDefined();
        expect(killMsg.reliable_msg_id).toBe(
            `${battle.battle_id}_killed_${reporter.account_id}_${victim.account_id}_b1`,
        );
        // Leading id segment must equal the message's own user_id field.
        expect(killMsg.reliable_msg_id).toContain(`_killed_${killMsg.user_id}_`);
    });
});
