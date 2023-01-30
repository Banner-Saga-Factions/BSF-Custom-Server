import crypto from "crypto";
import * as BattleData from "./BattleTurnData";
import { GameModes, ServerClasses } from "../const";
import { BattlePartyData } from "./BattlePartyData";
import { Session, sessionHandler } from "../sessions";
import { read, readFileSync } from "fs";
import { Router } from "express";

const generateBattleId = () => {
  return crypto.randomBytes(10).toString("hex");
};

export const BattleRouter = Router();

export class Battle {
  battle_id: string;
  parties: Array<{ partyData: BattlePartyData; session: Session }>; // TODO: Shouldnt be a session, rather a party/team custom type
  type: GameModes;
  tourney_id: number;
  power: number;
  turns: Array<any> = [];
  turnNum: number = 0;
  nextExecutionId: number = 1; // TODO: set properly in constructor

  constructor(
    partySessions: Array<Session>,
    GameMode: GameModes,
    power: number
  ) {
    this.battle_id = generateBattleId();
    this.parties = [];
    this.type = GameMode;
    this.power = power;
    this.tourney_id = this.type === "QUICK" ? 0 : 1;

    partySessions.forEach((session, idx) => {
      this.parties.push({
        partyData: this.createBattlePartyData(session.user_id, idx),
        session: session,
      });
    });

    let newBattle: BattleData.BattleCreateData = {
      class: ServerClasses.BATTLE_CREATE_DATA,
      user_id: 0,
      battle_id: this.battle_id,
      tourney_id: this.tourney_id,
      scene: "greathall",
      friendly: false,
      parties: this.parties.map((party) => party.partyData),
      ...this.setReliableMessageData("_create"),
    };

    partySessions.forEach((session) => {
      session.pushData(newBattle);
    });
  }

  setReliableMessageData(reliable_msg_postfix: string): BattleData.ReliableMsg {
    return {
      reliable_msg_id: this.battle_id + reliable_msg_postfix,
      reliable_msg_target: null,
      timestamp: new Date().getTime(),
    };
  }

  setBaseBattleData(
    reliable_msg_postfix: string,
    server_class: ServerClasses,
    user_id: number
  ): BattleData.BaseBattleData {
    return {
      ...this.setReliableMessageData(reliable_msg_postfix),
      class: server_class,
      battle_id: this.battle_id,
      user_id: user_id,
    };
  }

  private createBattlePartyData(user_id: number, idx: number): BattlePartyData {
    // this is shit (should be fixed when user database is setup)
    let session = sessionHandler.getSession("user_id", user_id);
    let acc = JSON.parse(readFileSync("./data/acc.json", "utf-8"));

    let data: BattlePartyData = {
      class: ServerClasses.BATTLE_PARTY_DATA,
      user: user_id,
      team: `${user_id}`,
      display_name: session!.display_name,
      defs: (acc.roster.defs as Array<any>).filter((unit) =>
        acc.party.ids.includes(unit.id)
      ),
      match_handle: session!.match_handle,
      party_index: idx,
      elo: this.type === "QUICK" ? 0 : 1000, // do something else if not quick play
      power: this.power,
      session_key: session!.session_key,
      battle_count: 1,
      tourney_id: this.type === "QUICK" ? 0 : 1, // do something else if not quick play
      timer: 45,
      vs_type: this.type,
    };
    return data;
  }

  private createHashStr(): String {
    let ending_entity: string =
      this.turnNum > 0 ? this.turns[this.turnNum].entity : null;
    let hashStr = `ending_turn=${
      this.turnNum - 1
    } ending_entity=${ending_entity} executedAbilityId=${
      this.nextExecutionId
    }\n`;
    // for each team in parties (see parties TODO) for each entity in the party
    // let entityStr = `sync=${this.battle_id} ${entity.id} tile=${entity.tile}`
    // for each stat in entity
    //      stats = make string from stats
    // hashStr.concat(entityStr + stats)
    return hashStr;
  }
}

var battles: Array<Battle> = [];

export const battleHandler = {
  getBattles: (): Array<Battle> => {
    return battles;
  },
  addBattle: (parties: Array<Session>, GameMode: GameModes, power: number) => {
    let battle = new Battle(parties, GameMode, power);
    battles.push(battle);
    return battle;
  },
  getBattle: (battle_id: string): Battle | undefined => {
    return battles.find((battle) => battle.battle_id === battle_id);
  },
  getOpponent: (battle_id: string, user_id: number): Session | undefined => {
    let battle = battleHandler.getBattle(battle_id);
    if (!battle) return;
    battle.parties.find((party) => party.session.user_id !== user_id)?.session;
  },
};

BattleRouter.post("/ready/:session_key", (req, res) => {
  let battle = battleHandler.getBattle(req.body.battle_id);
  if (!battle) {
    res.sendStatus(404);
    return;
  }
  let sender: Session = (req as any).session;
  let ready: BattleData.BaseBattleData = {
    class: ServerClasses.BATTLE_READY_DATA,
    user_id: sender.user_id,
    battle_id: battle.battle_id,
    ...battle.setReliableMessageData(`_ready_${sender.user_id}`),
  };
  battleHandler.getOpponent(battle.battle_id, sender.user_id)?.pushData(ready);
  res.send();
});

BattleRouter.post("/deploy/:session_key", (req, res) => {
  let battle = battleHandler.getBattle(req.body.battle_id);
  if (!battle) {
    res.sendStatus(404);
    return;
  }
  let tiles = req.body.tiles;
  tiles.forEach((tile: any) => {
    tile.class = ServerClasses.BATTLE_DATA_TILE;
  });
  let sender = (req as any).session;
  let data = {
    ...battle.setBaseBattleData(
      `_deploy_${sender.user_id}`,
      ServerClasses.BATTLE_DEPLOY_DATA,
      sender.user_id
    ),
    tiles: tiles,
  };
  battleHandler.getOpponent(battle.battle_id, sender.user_id)?.pushData(data);
  res.send();
});

BattleRouter.post("/sync/:session_key", (req, res) => {
  let opponent = battleHandler.getOpponent(
    req.body.battle_id,
    (req as any).session.user_id
  );
});

BattleRouter.post("/query/:session_key", (req, res) => {});

BattleRouter.post("/move/:session_key", (req, res) => {});

BattleRouter.post("/action/:session_key", (req, res) => {});

BattleRouter.post("/killed/:session_key", (req, res) => {});
