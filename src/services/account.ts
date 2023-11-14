import { Router } from "express";
export const AccountRouter = Router();
import * as UserFunctions from "@api/utils/users/users.controller";
import * as PartyFunctions from "@api/utils/parties/parties.controller";
import * as EntityDefFunctions from "@api/utils/entityDefs/entityDefs.controller";
import * as StatsFunctions from "@api/utils/stats/stats.controller";
import * as PurchasableUnitsFunctions from "@api/utils/purchasableUnits/purchasableUnits.controller";

// Used for requesting account info from game launcher
// i.e. when user has no active session

AccountRouter.post("/update", (req, res) => {
    let userId = (req as any).userId || (req as any).session.user_id;

    Object.entries(req.body).forEach(([key, value]) => {
        // TODO: update user in database by userid
        console.log(key, value);
    });
    return res.send();
});

// get account info
AccountRouter.get("/info/:session_key", async (req, res) => {
    // return user data (will require some handlers for packing data)
    // TODO: implement handlers for packing acc data

    let session = (req as any).session;

    if (session.user_id > 0) {
        let userDetails = await UserFunctions.getUser(session.user_id);
        let userParty = await PartyFunctions.getUserParty(session.user_id);
        let userRosters = await EntityDefFunctions.getUserEntityDefs(session.user_id);

        var userDetailsJson = JSON.parse(JSON.stringify(userDetails));
        var userPartyJson = JSON.parse(JSON.stringify(userParty));
        var userRostersJson = JSON.parse(JSON.stringify(userRosters));

        var userPartyList = new Array();

        userPartyJson.forEach((ele: { unit_id: any }) => {
            userPartyList.push(ele.unit_id);
        });

        var userRosterList = [];

        for (let indexA = 0; indexA < userRostersJson.length; indexA++) {
            let userRosterStats = await StatsFunctions.getEntityDefsStats(userRostersJson[indexA].id);
            var userRosterStatsJson = JSON.parse(JSON.stringify(userRosterStats));

            var statsList = [];

            for (let index = 0; index < userRosterStatsJson.length; index++) {
                statsList.push({
                    class: "tbs.srv.data.Stat" /*userRosterStatsJson[index].class*/,
                    stat: userRosterStatsJson[index].stat,
                    value: userRosterStatsJson[index].value,
                });
            }

            userRosterList.push({
                class: "tbs.srv.data.EntityDef", //userRostersJson[indexA].class,
                id: userRostersJson[indexA].unit_id,
                entityClass: userRostersJson[indexA].entity_class,
                name: userRostersJson[indexA].name,
                stats: statsList,
                appearance_acquires: userRostersJson[indexA].appearance_acquires,
                appearance_index: userRostersJson[indexA].appearance_index,
            });
        }

        var purchasesList = [];

        var purchasableUnitsEntityDefs = await EntityDefFunctions.getUserEntityDefs(0); //0 refers to the purchasable units

        var purchasableUnitsEntDefsJson = JSON.parse(JSON.stringify(purchasableUnitsEntityDefs));

        var purchasableUnitsList = await PurchasableUnitsFunctions.getPurchasableUnits();
        var purchasableUnitsJson = JSON.parse(JSON.stringify(purchasableUnitsList));

        for (let indexA = 0; indexA < purchasableUnitsJson.length; indexA++) {
            let purchasableUnitsStats = await StatsFunctions.getEntityDefsStats(
                purchasableUnitsJson[indexA].entitydef_fk
            );
            var purchasableUnitsStatsJson = JSON.parse(JSON.stringify(purchasableUnitsStats));

            var puEntDef = purchasableUnitsEntDefsJson.find(
                (x: any) => x.id == purchasableUnitsJson[indexA].entitydef_fk
            );

            var statsList = [];

            for (let index = 0; index < purchasableUnitsStatsJson.length; index++) {
                statsList.push({
                    class: /*purchasableUnitsStatsJson[index].class*/ "tbs.srv.data.Stat",
                    stat: purchasableUnitsStatsJson[index].stat,
                    value: purchasableUnitsStatsJson[index].value,
                });
            }

            purchasesList.push({
                class: "tbs.srv.data.PurchasableUnitData", //purchasableUnitsJson[indexA].pu_class,
                def: {
                    //class: puEntDef[0].classs,
                    class: "tbs.srv.data.EntityDef",
                    id: puEntDef.unit_id,
                    entityClass: puEntDef.entity_class,
                    autoLevel: purchasableUnitsJson[indexA].auto_level,
                    stats: statsList,
                    start_date: new Date(puEntDef.def_start_date).getTime(),
                    appearance_acquires: puEntDef.def_appearance_acquires,
                    appearance_index: puEntDef.def_appearance_index,
                },
                limit: purchasableUnitsJson[indexA].limit,
                cost: purchasableUnitsJson[indexA].cost,
                comment: purchasableUnitsJson[indexA].comment == "" ? undefined : purchasableUnitsJson[indexA].comment,
            });
        }

        var userAccInfoObj = {
            purchases: [],
            daily_login_streak: userDetailsJson[0].daily_login_streak,
            renown: userDetailsJson[0].renown,
            iap_sandbox: userDetailsJson[0].iap_sandbox == 1 ? true : false,
            completed_tutorial: userDetailsJson[0].completed_tutorial == 1 ? true : false,
            daily_login_bonus: userDetailsJson[0].daily_login_bonus,
            unlocks: [],
            roster_rows: userDetailsJson[0].roster_rows,
            purchasable_units: { class: "tbs.srv.data.PurchasableUnitsData", units: purchasesList, id: "global" },
            roster: { defs: userRosterList },
            party: { ids: userPartyList },
            login_count: userDetailsJson[0].login_count,
        };

        res.json(JSON.parse(JSON.stringify(userAccInfoObj)));
    }
});
