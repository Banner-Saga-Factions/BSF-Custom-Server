import { Router } from "express";
export const AccountRouter = Router();
import * as UserFunctions from "@api/utils/users/users.controller";
import * as PurchasableUnitsFunctions from "@api/utils/purchasableUnits/purchasableUnits.controller";
import { Config } from "../config/config";

let config: Config;

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

    UserFunctions.setDatabase(config.database);
    let session = (req as any).session;

    if (session.user_id > 0) {
        let userDetails = await UserFunctions.getUser(session.user_id);
        let userParty = await UserFunctions.getUserParty(session.user_id);
        let userRosters = await UserFunctions.getUserRosters(session.user_id);

        var userDetailsJson = JSON.parse(JSON.stringify(userDetails));
        var userPartyJson = JSON.parse(JSON.stringify(userParty));
        var userRostersJson = JSON.parse(JSON.stringify(userRosters));

        var userPartyList = new Array();

        userPartyJson.forEach((ele: { unit_id: any }) => {
            userPartyList.push(ele.unit_id);
        });

        var userRosterList = [];

        for (let indexA = 0; indexA < userRostersJson.length; indexA++) {
            let userRosterStats = await UserFunctions.getUserRosterStats(userRostersJson[indexA].roster_id);
            var userRosterStatsJson = JSON.parse(JSON.stringify(userRosterStats));

            var statsList = [];

            for (let index = 0; index < userRosterStatsJson.length; index++) {
                statsList.push({
                    class: userRosterStatsJson[index].class,
                    stat: userRosterStatsJson[index].stat,
                    value: userRosterStatsJson[index].value,
                });
            }

            userRosterList.push({
                class: userRostersJson[indexA].class,
                id: userRostersJson[indexA].id,
                entityClass: userRostersJson[indexA].entity_class,
                name: userRostersJson[indexA].name,
                stats: statsList,
                appearance_acquires: userRostersJson[indexA].appearance_acquires,
                appearance_index: userRostersJson[indexA].appearance_index,
            });
        }

        var purchasesList = [];
        var purchasableUnitsList = await PurchasableUnitsFunctions.getPurchasableUnits();
        var purchasableUnitsJson = JSON.parse(JSON.stringify(purchasableUnitsList));

        for (let indexA = 0; indexA < purchasableUnitsJson.length; indexA++) {
            let purchasableUnitsStats = await PurchasableUnitsFunctions.getPurchasableUnitStats(
                purchasableUnitsJson[indexA].id
            );
            var purchasableUnitsStatsJson = JSON.parse(JSON.stringify(purchasableUnitsStats));

            var statsList = [];

            for (let index = 0; index < purchasableUnitsStatsJson.length; index++) {
                statsList.push({
                    class: purchasableUnitsStatsJson[index].class,
                    stat: purchasableUnitsStatsJson[index].stat,
                    value: purchasableUnitsStatsJson[index].value,
                });
            }

            purchasesList.push({
                class: purchasableUnitsJson[indexA].pu_class,
                def: {
                    class: purchasableUnitsJson[indexA].def_class,
                    id: purchasableUnitsJson[indexA].def_id,
                    entityClass: purchasableUnitsJson[indexA].def_entity_class,
                    autoLevel: purchasableUnitsJson[indexA].def_auto_level,
                    stats: statsList,
                    start_date: new Date(purchasableUnitsList[indexA].def_start_date).getTime(),
                    appearance_acquires: purchasableUnitsJson[indexA].def_appearance_acquires,
                    appearance_index: purchasableUnitsJson[indexA].def_appearance_index,
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
