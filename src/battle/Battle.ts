import crypto from "crypto";
import * as BattleData from "./BattleTurnData";
import { AchievementType, GameModes, ServerClasses } from "../const";
import { BattlePartyData } from "./BattlePartyData";
import { Session, sessionHandler } from "../sessions";
import { readFileSync } from "fs";
import { Router } from "express";

const generateBattleId = () => {
  return crypto.randomBytes(10).toString("hex");
};

export const BattleRouter = Router();

export class Battle {
  battle_id: string;
  parties: Array<{ partyData: BattlePartyData; session: Session }>;
  type: GameModes;
  tourney_id: number;
  power: number;
  turns: Array<Array<any>> = [];
  turnNum: number = 0;
  nextExecutionId: number = 1; // TODO: set properly in constructor
  aliveUnits: any = {};

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
      let party = this.createBattlePartyData(session.user_id, idx)
      this.parties.push({
        partyData: party,
        session: session,
      });
      this.aliveUnits[`${party.user}`] = party.defs.map((entity) => entity.id);
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
      defs: [acc.roster.defs[0]],
      //(acc.roster.defs as Array<any>).filter((unit) =>
      //  acc.party.ids.includes(unit.id)
      //),
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
    return battle.parties.find((party) => party.session.user_id !== user_id)
      ?.session;
  },
};

BattleRouter.use((req, res, next) => {
  let battle = battleHandler.getBattle(req.body.battle_id);
  if (!battle) {
    res.sendStatus(404);
    return;
  }

  (req as any).battle = battle;
  (req as any).opponent = battleHandler.getOpponent(
    battle.battle_id,
    (req as any).session.user_id
  );

  next();
});

BattleRouter.post("/ready/:session_key", (req, res) => {
  let data = req as any;

  let readyData: BattleData.BaseBattleData = data.battle.setBaseBattleData(
    `_ready_${data.session.user_id}`,
    ServerClasses.BATTLE_READY_DATA,
    data.session.user_id
  );
  data.opponent.pushData(readyData);
  res.send();
});

BattleRouter.post("/deploy/:session_key", (req, res) => {
  let data = req as any;

  let tiles = req.body.tiles;
  tiles.forEach((tile: any) => {
    tile.class = ServerClasses.BATTLE_TILE_DATA;
  });
  let deployData = {
    ...(data.battle as Battle).setBaseBattleData(
      `_deploy_${data.session.user_id}`,
      ServerClasses.BATTLE_DEPLOY_DATA,
      data.session.user_id
    ),
    tiles: tiles,
  };
  data.opponent.pushData(deployData);
  res.send();
});

BattleRouter.post("/sync/:session_key", (req, res) => {
  let data = req as any;
  let battle: Battle = data.battle;
  if (!battle.turns[req.body.turn]) {
    battle.turns[req.body.turn] = [];
  }

  let syncData: BattleData.BattleSyncData = {
    ...battle.setBaseBattleData(
      `_deploy_${data.session.user_id}`,
      ServerClasses.BATTLE_SYNC_DATA,
      data.session.user_id
    ),
    turn: req.body.turn,
    entity: req.body.entity,
    ordinal: 0,
    team: String(data.session.user_id),
    hash: req.body.hash,
    hash_str: null,
  };
  data.opponent.pushData(syncData);
  res.send();
});

BattleRouter.post("/query/:session_key", (req, res) => {
  let battle: Battle = (req as any).battle;
  let turn: number = req.body.turn;

  let data = battle.turns[turn];
  data.forEach((action) => {
    action.timestamp = new Date().getTime();
  });

  (req as any).session.pushData(data);
  res.send();
});

BattleRouter.post("/move/:session_key", (req, res) => {
  let data = req as any;
  let tiles = req.body.tiles;

  tiles.forEach((tile: any) => {
    tile.class = ServerClasses.BATTLE_TILE_DATA;
  });

  let moveData: BattleData.BattleMoveData = {
    ...(data.battle as Battle).setBaseBattleData(
      `_move_${data.session.user_id}_${req.body.turn}`,
      ServerClasses.BATTLE_MOVE_DATA,
      data.session.user_id
    ),
    turn: req.body.turn,
    entity: req.body.entity,
    ordinal: req.body.ordinal,
    tiles: tiles,
  };

  (data.battle as Battle).turns[req.body.turn].push(moveData);
  data.opponent.pushData(moveData);
  res.send();
});

BattleRouter.post("/action/:session_key", (req, res) => {
  let data = req as any;
  let tiles = req.body.tiles;

  tiles.forEach((tile: any) => {
    tile.class = ServerClasses.BATTLE_TILE_DATA;
  });

  let actionData: BattleData.BattleActionData = {
    ...(data.battle as Battle).setBaseBattleData(
      `/${data.session.user_id}/${req.body.turn}`,
      ServerClasses.BATTLE_ACTION_DATA,
      data.session.user_id
    ),
    action: req.body.action,
    executed_id: req.body.executed_id,
    level: req.body.level,
    target_ids: req.body.target_ids,
    tiles: tiles,
    terminator: req.body.terminator,
    turn: req.body.turn,
    entity: req.body.entity,
    ordinal: req.body.ordinal,
  };

  (data.battle as Battle).turns[req.body.turn].push(actionData);
  data.opponent.pushData(actionData);
  res.send();
});

BattleRouter.post("/killed/:session_key", (req, res) => {
  let data = req as any;
  let battle: Battle = data.battle;

  let killData: BattleData.BattleKilledData = {
    ...battle.setBaseBattleData(
      `_killed_${req.body.killedparty}_${req.body.killedparty}_${req.body.entity}`,
      ServerClasses.BATTLE_KILLED_DATA,
      data.session.user_id
    ),
    turn: req.body.turn,
    entity: req.body.entity,
    ordinal: req.body.ordinal,
    killedparty: req.body.killedparty,
    killer: req.body.killer,
    killerparty: req.body.killerparty,
  };

  let entityIdx = battle.aliveUnits[req.body.killedparty].indexOf(req.body.entity)
  if (entityIdx > -1) {
    battle.aliveUnits[req.body.killedparty].splice(entityIdx, 1);
  }

  if (!battle.aliveUnits[req.body.killedparty].length) {
    endgame(data)
  }

  

  data.opponent.pushData(killData);
  res.send();
});


const endgame = (data: any)=>{
  let ach_data: Array<BattleData.AchievementProgressData> = [];
  let ach_type: keyof typeof AchievementType;
  [data.session, data.opponent].forEach((session: Session) => {
    for (ach_type in AchievementType) {
      ach_data.push(
        {
          class: ServerClasses.ACHIEVEMENT_PROGRESS_DATA,
          account_id: session.user_id,
          session_key: session.session_key,
          delta: 0,
          total: 1,
          acquired: [],
          handle: `${data.battle.battle_id}.${ach_data.length}.${session.user_id}.${ach_type}`,
          battle_id: data.battle.battle_id,
          achievement_type: ach_type as AchievementType,
        }
      )
    }
  });
  data.session.pushData(ach_data);
  data.opponent.pushData(ach_data);
  
  [data.session, data.opponent].forEach((session: Session) => {
    let ts = new Date().getTime();
    let renown_count = 100;
    let renown_msg: BattleData.RenownMessage = {
      reliable_msg_id: `renown_${session.user_id}_${ts}_${renown_count}`,
      reliable_msg_target: null,
      class: ServerClasses.RENOWN_MESSAGE,
      timestamp: ts,
      total: renown_count,
      user_id: session.user_id
  };

  let user_id = 0;
  let winner: string = '';
  Object.entries((data.battle as Battle).aliveUnits).forEach(([uid, units])=>{
    if ((units as Array<string>).length) winner = uid;
  })
  let battle_finished: BattleData.BattleFinishedData = {
    ...(data.battle as Battle).setBaseBattleData(
      `_finished_${user_id}`,
      ServerClasses.BATTLE_KILLED_DATA,
      user_id
    ),
    victoriousTeam: winner,
    total_renown: 100,
    rewards: []
  }
  session.pushData(renown_msg);
  session.pushData(battle_finished);
});
}