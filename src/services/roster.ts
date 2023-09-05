import { Router } from "express";
import * as UserFunctions from "@api/utils/users/users.controller";
import * as UserModels from "@api/utils/users/users.model";
import * as PurchasableUnitsFunctions from "@api/utils/purchasableUnits/purchasableUnits.controller";
import * as StatsFunctions from "@api/utils/stats/stats.controller";
import * as StatsModels from "@api/utils/stats/stats.model";

export const RosterRouter = Router();

RosterRouter.post("/party/arrange/:session_key", (req, res) => {
    let session = (req as any).session;
    var newPartySetup = req.body.party;

    UserFunctions.deletetUserParty(session.user_id);

    for (let index = 0; index < newPartySetup.length; index++) {
        UserFunctions.insertUserParty(session.user_id, newPartySetup[index]);
    }

    res.send();
});

//Promote unit
RosterRouter.post("/unit/promote/:session_key", async (req, res) => {
    let session = (req as any).session;

    var userFk = session.user_id;
    var unitToPromote = req.body.unit_id;

    var unitDetails = await UserFunctions.getUnitByUserIdAndUnitId(userFk, unitToPromote);

    if (unitDetails != null) {
        var unitDetailsJson = JSON.parse(JSON.stringify(unitDetails));

        var updateResult = await UserFunctions.updateRosterRank(unitDetailsJson[0].id);
        await UserFunctions.updateUnitName(userFk, unitToPromote, req.body.name);
        var updateResult2 = await UserFunctions.updateUnitClass(userFk, unitToPromote, req.body.class_id);

        var updateResultJson = JSON.parse(JSON.stringify(updateResult));
        //console.log(updateResultJson.affectedRows + ' ' + updateResultJson[0].affectedRows);
        //if(updateResultJson.affectedRows > 0){

        var unit = await UserFunctions.getUnitByUserIdAndUnitId(userFk, unitToPromote);
        var unitJson = JSON.parse(JSON.stringify(unit));
        //console.log(unitJson[0].id);
        var unitStats = await UserFunctions.getUserRosterStat(unitJson[0].id, 1); //get RANK value
        //console.log(unitStats);
        var unitStatsJson = JSON.parse(JSON.stringify(unitStats));

        var renownToDeduct = 0;

        //console.log(unitStatsJson);

        if (unitStatsJson != null) {
            if (unitStatsJson[0].value == 1) renownToDeduct = 20;
            else if (unitStatsJson[0].value == 2) renownToDeduct = 80;
            else if (unitStatsJson[0].value >= 3) renownToDeduct = 160;

            await UserFunctions.updateUsersRenown(renownToDeduct, userFk); // 20 -> 80 -> 160

            res.send();
        }
        //}
    }
});

//Buy Variation
RosterRouter.post("/unit/variation/:session_key/:unit_id/:variation/:test", async (req, res) => {
    let session = (req as any).session;
    console.log("???");
    var userFk = session.user_id;

    console.log(req.params.session_key);
    console.log(req.params.unit_id);
    console.log(req.params.variation);
    console.log(req.params.test);

    res.send();
    //UserFunctions.updateUsersRenown(90, userFk);
});

//Rename Unit
RosterRouter.post("/unit/rename/:session_key", async (req, res) => {
    let session = (req as any).session;

    var userFk = session.user_id;

    var name = req.body.name;
    var unitId = req.body.unit_id;

    if (name != "" && unitId != "") {
        UserFunctions.updateUnitName(userFk, unitId, name);
        UserFunctions.updateUsersRenown(10, userFk);

        res.send();
    }
});

//Dismiss Unit
RosterRouter.post("/unit/retire/:session_key", async (req, res) => {
    let session = (req as any).session;

    var userFk = session.user_id;

    var unitId = req.body.unit_id;

    if (unitId != "") {
        await UserFunctions.deleteRosterStats(userFk, unitId);
        await UserFunctions.deleteRoster(userFk, unitId);

        res.send();
    }
});

//Hire/Purchase Unit
RosterRouter.post("/unit/hire/:session_key", async (req, res) => {
    let session = (req as any).session;

    var userFk = session.user_id;

    var newUnitId = req.body.new_unit_id;
    var newUnitName = req.body.new_unit_name;
    var purchasableUnitId = req.body.purchasable_unit_id;

    var purchUnitDetails = await PurchasableUnitsFunctions.getPurchasableUnitByDefId(purchasableUnitId);

    if (purchUnitDetails != null) {
        var purchUnitJson = JSON.parse(JSON.stringify(purchUnitDetails));

        UserFunctions.updateUsersRenown(purchUnitJson[0].cost, userFk);

        var purchUnitStats = await PurchasableUnitsFunctions.getPurchasableUnitStatsRaw(purchUnitJson[0].id);

        if (purchUnitStats != null) {
            var purchUnitStatsJson = JSON.parse(JSON.stringify(purchUnitStats));

            var newUnitIdToInsert = newUnitId;
            var splitUnitId = newUnitId.split("_");

            if (splitUnitId.length < 3) {
                newUnitIdToInsert = splitUnitId[0] + "_start_";

                var maxUnitId = await PurchasableUnitsFunctions.getRosterMaxUnitId(userFk, newUnitIdToInsert + "%");

                if (maxUnitId != null && Object.keys(maxUnitId).length > 0) {
                    var maxUnitIdRoster = JSON.parse(JSON.stringify(maxUnitId));

                    var splitMaxUnitId = maxUnitIdRoster[0].unit_id.split("_")[2];
                    splitMaxUnitId = Number(splitMaxUnitId) + 1;

                    newUnitIdToInsert = newUnitIdToInsert + splitMaxUnitId;
                } else {
                    newUnitIdToInsert = newUnitIdToInsert + "0";
                }
            }

            var newRoster = new UserModels.AddRoster(
                userFk,
                3,
                newUnitIdToInsert,
                purchasableUnitId.split("_")[0],
                newUnitName
            );

            await PurchasableUnitsFunctions.insertUserRoster(newRoster);

            var newRosterId = await PurchasableUnitsFunctions.getUserRosterByUnitId(userFk, newUnitIdToInsert);
            var newRosterIdJson = JSON.parse(JSON.stringify(newRosterId));

            for (let index = 0; index < purchUnitStatsJson.length; index++) {
                await PurchasableUnitsFunctions.insertUserRosterStat(
                    newRosterIdJson[0].id,
                    purchUnitStatsJson[index].stat_fk,
                    purchUnitStatsJson[index].value
                );
            }

            res.send();
        }
    }
});

RosterRouter.post("/unit/stats/purchase/:session_key", async (req, res) => {
    let session = (req as any).session;

    var userFk = session.user_id;

    var unitToUpgrade = req.body.unit_id;
    var deltas = req.body.deltas;
    var stats = req.body.stats;

    //console.log(unitToUpgrade);
    //console.log(deltas);
    //console.log(stats);

    var rosterId = await PurchasableUnitsFunctions.getUserRosterByUnitId(userFk, unitToUpgrade);
    var rosterIdJson = JSON.parse(JSON.stringify(rosterId));

    if (rosterId != null) {
        for (let index = 0; index < stats.length; index++) {
            var statDetails = await StatsFunctions.getStatByName(stats[index]);
            var statDetailsJson = JSON.parse(JSON.stringify(statDetails));

            if (statDetailsJson != null) {
                //console.log(rosterIdJson[0].id + ' ' + statDetailsJson[0].id + ' ' + deltas[index]);
                await UserFunctions.updateRosterStat(deltas[index], rosterIdJson[0].id, statDetailsJson[0].id);
            }
        }
    }

    res.send();
});

//Expand Barracks
RosterRouter.post("/unlock/:session_key", async (req, res) => {
    let session = (req as any).session;

    await UserFunctions.expandUserBarracks(session.user_id);

    res.send();
});
