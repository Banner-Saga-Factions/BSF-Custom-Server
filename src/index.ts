import express from 'express';
import { readFileSync } from 'fs';
import http from "http";
import { AuthRouter, sessionHandler } from './sessions';
import { ChatRouter } from './chat';
import { BattleRouter } from './battle/Battle';
import { QueueRouter } from './queue';
import * as MySQLConnector from  './api/utils/mysql.connector';
import * as UserFunctions from './api/utils/users/users.controller';
import * as UserModels from './api/utils/users/users.model';
import * as PurchasableUnitsFunctions from './api/utils/purchasableUnits/purchasableUnits.controller';
import * as StatsFunctions from './api/utils/stats/stats.controller';
import * as StatsModels from './api/utils/stats/stats.model';

const app = express();

app.disable('etag'); // disables caching responses
app.use(express.json()); // parse data as json unless otherwise specified

// create database pool
MySQLConnector.init();

/** 
 * All requests to the server after login end the url with a session key, 
 * [with the exception of steam/overlay/{session_id}/{state}]. This middleware
 * extracts the session key and checks it is a valid session before continuing.
**/
app.use((req, res, next) => {
    // steam overlay requests dont end with the session key but the server
    // doesnt seem to do anything with the request anyway so skip check 
    if (req.path.startsWith("/services/session/steam/overlay/")) {
        next();
        return;
    };

    // get session key from url
    let session_key = req.path.substring(req.path.lastIndexOf("/") + 1)
    // search for corresponding session object
    let session = sessionHandler.getSession("session_key", session_key);

    // if no session found return unauthorised
    // the login route ends with /11 so in that case the user has no session
    // and the extracted "key" will be 11, so in this case the request can continue
    if (!session && session_key !== "11") {
        res.sendStatus(403);
        return;
    }

    // adding the session object to the request object so
    // each module doesn't need to lookup the session again
    //@ts-ignore
    req.session = session;
    next();
});


app.use("/services/auth", AuthRouter);

app.use("/services/chat", ChatRouter);

app.use("/services/vs", QueueRouter);

app.use("/services/battle", BattleRouter);

// request leaderboard or update server of location
app.post("/services/game/leaderboards/:session_key", (req, res) => {
    // parse board_ids and tourney from body 
    // and lookup database
    res.json(JSON.parse(readFileSync("./data/lboard.json", 'utf-8')));
});

// poll for relevant data
app.get("/services/game/:session_key", (req, res) => {
    let session = (req as any).session
    
    // send buffered data and clear
    if (session.data.length > 0) {
        res.json(session.data);
        session.data = [];
    }
    else {
        res.send();
    }
});

/**
 * Random routes that either have temp data or idk what their purpose is
 */

// get account info
app.get("/services/account/info/:session_key", async (req, res) => {
    // return user data (will require some handlers for packing data)
    // TODO: implement handlers for packing acc data

    let session = (req as any).session

    if(session.user_id > 0){
        let userDetails = await UserFunctions.getUser(session.user_id);
        let userParty = await UserFunctions.getUserParty(session.user_id);
        let userRosters = await UserFunctions.getUserRosters(session.user_id);

        var userDetailsJson = JSON.parse(JSON.stringify(userDetails));
        var userPartyJson = JSON.parse(JSON.stringify(userParty));
        var userRostersJson = JSON.parse(JSON.stringify(userRosters));

        var userPartyList = new Array();

        userPartyJson.forEach((ele: { unit_id: any; }) => {
            userPartyList.push((ele.unit_id));
        });

        var userRosterList = [];

        for (let indexA = 0; indexA < userRostersJson.length; indexA++) { 
            let userRosterStats = await UserFunctions.getUserRosterStats(userRostersJson[indexA].roster_id);
            var userRosterStatsJson = JSON.parse(JSON.stringify(userRosterStats));

            var statsList = [];

            for (let index = 0; index < userRosterStatsJson.length; index++) {
                statsList.push({ class: userRosterStatsJson[index].class, stat: userRosterStatsJson[index].stat, value: userRosterStatsJson[index].value });
            }

            userRosterList.push({
                class: userRostersJson[indexA].class,
                id: userRostersJson[indexA].id,
                entityClass: userRostersJson[indexA].entity_class,
                name: userRostersJson[indexA].name,
                stats: statsList,
                appearance_acquires: userRostersJson[indexA].appearance_acquires,
                appearance_index: userRostersJson[indexA].appearance_index
            });
        };
        
        var purchasesList = [];
        var purchasableUnitsList = await PurchasableUnitsFunctions.getPurchasableUnits();
        var purchasableUnitsJson = JSON.parse(JSON.stringify(purchasableUnitsList));

        for (let indexA = 0; indexA < purchasableUnitsJson.length; indexA++) { 
            let purchasableUnitsStats = await PurchasableUnitsFunctions.getPurchasableUnitStats(purchasableUnitsJson[indexA].id);
            var purchasableUnitsStatsJson = JSON.parse(JSON.stringify(purchasableUnitsStats));

            var statsList = [];

            for (let index = 0; index < purchasableUnitsStatsJson.length; index++) {
                statsList.push({ class: purchasableUnitsStatsJson[index].class, stat: purchasableUnitsStatsJson[index].stat, value: purchasableUnitsStatsJson[index].value });
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
                    appearance_index: purchasableUnitsJson[indexA].def_appearance_index
                },
                limit: purchasableUnitsJson[indexA].limit,
                cost: purchasableUnitsJson[indexA].cost,
                comment: purchasableUnitsJson[indexA].comment == "" ? undefined : purchasableUnitsJson[indexA].comment
            });
        };

        var userAccInfoObj = { 
            purchases: [],
            daily_login_streak: userDetailsJson[0].daily_login_streak, 
            renown: userDetailsJson[0].renown,
            iap_sandbox: (userDetailsJson[0].iap_sandbox == 1 ? true : false),
            completed_tutorial: (userDetailsJson[0].completed_tutorial == 1 ? true : false),
            daily_login_bonus: userDetailsJson[0].daily_login_bonus,
            unlocks: [],
            roster_rows: userDetailsJson[0].roster_rows,
            purchasable_units: { class: "tbs.srv.data.PurchasableUnitsData", units: purchasesList, id: "global" },
            roster: { defs: userRosterList },
            party: { ids: userPartyList },
            login_count: userDetailsJson[0].login_count
         };
         
         res.json(JSON.parse(JSON.stringify(userAccInfoObj)));
    }
})

app.post("/services/roster/party/arrange/:session_key", (req, res) => {

    let session = (req as any).session
    var newPartySetup = req.body.party;

    UserFunctions.deletetUserParty(session.user_id);
    
    for (let index = 0; index < newPartySetup.length; index++) { 
        UserFunctions.insertUserParty(session.user_id, newPartySetup[index]);
    };

    res.send();
});

//Promote unit
app.post("/services/roster/unit/promote/:session_key", async (req, res) => {

    let session = (req as any).session

    var userFk = session.user_id;
    var unitToPromote = req.body.unit_id;
    
    var unitDetails = await UserFunctions.getUnitByUserIdAndUnitId(userFk, unitToPromote);

    if(unitDetails != null){
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

            if(unitStatsJson != null){

                if(unitStatsJson[0].value == 1)
                    renownToDeduct = 20;
                else if(unitStatsJson[0].value == 2)
                    renownToDeduct = 80;
                else if(unitStatsJson[0].value >= 3)
                    renownToDeduct = 160;

                await UserFunctions.updateUsersRenown(renownToDeduct, userFk); // 20 -> 80 -> 160

                res.send();
            }
        //}
    }
});

//Buy Variation
app.post("/services/roster/unit/variation/:session_key/:unit_id/:variation/:test", async (req, res) => {
    let session = (req as any).session
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
app.post("/services/roster/unit/rename/:session_key", async (req, res) => {
    
    let session = (req as any).session
    
    var userFk = session.user_id;

    var name = req.body.name;
    var unitId = req.body.unit_id;

    if(name != '' && unitId != ''){
        UserFunctions.updateUnitName(userFk, unitId, name);
        UserFunctions.updateUsersRenown(10, userFk);

        res.send();
    }
});

//Dismiss Unit
app.post("/services/roster/unit/retire/:session_key", async (req, res) => {
    let session = (req as any).session
    
    var userFk = session.user_id;

    var unitId = req.body.unit_id;

    if(unitId != ''){

        await UserFunctions.deleteRosterStats(userFk, unitId);
        await UserFunctions.deleteRoster(userFk, unitId);

        res.send();
    }
});

//Hire/Purchase Unit
app.post("/services/roster/unit/hire/:session_key", async (req, res) => {
    let session = (req as any).session
    
    var userFk = session.user_id;

    var newUnitId = req.body.new_unit_id;
    var newUnitName = req.body.new_unit_name;
    var purchasableUnitId = req.body.purchasable_unit_id;

    var purchUnitDetails = await PurchasableUnitsFunctions.getPurchasableUnitByDefId(purchasableUnitId);

    if(purchUnitDetails != null){
        
        var purchUnitJson = JSON.parse(JSON.stringify(purchUnitDetails));

        UserFunctions.updateUsersRenown(purchUnitJson[0].cost, userFk);
        
        var purchUnitStats = await PurchasableUnitsFunctions.getPurchasableUnitStatsRaw(purchUnitJson[0].id);
        
        if(purchUnitStats != null){
            var purchUnitStatsJson = JSON.parse(JSON.stringify(purchUnitStats));

            var newUnitIdToInsert = newUnitId;
            var splitUnitId = newUnitId.split("_");

            if(splitUnitId.length < 3){

                newUnitIdToInsert = splitUnitId[0] + "_start_";

                var maxUnitId = await PurchasableUnitsFunctions.getRosterMaxUnitId(userFk, newUnitIdToInsert + "%");
                
                if(maxUnitId != null && Object.keys(maxUnitId).length > 0){
                    var maxUnitIdRoster = JSON.parse(JSON.stringify(maxUnitId));
                    
                    var splitMaxUnitId = maxUnitIdRoster[0].unit_id.split("_")[2];
                    splitMaxUnitId = Number(splitMaxUnitId) + 1;

                    newUnitIdToInsert = newUnitIdToInsert + splitMaxUnitId;
                } else {
                    newUnitIdToInsert = newUnitIdToInsert + "0";
                } 
            } 

            var newRoster = new UserModels.AddRoster(
                userFk, 3, newUnitIdToInsert, purchasableUnitId.split("_")[0], newUnitName
            );

            await PurchasableUnitsFunctions.insertUserRoster(newRoster);
            
            var newRosterId = await PurchasableUnitsFunctions.getUserRosterByUnitId(userFk, newUnitIdToInsert);
            var newRosterIdJson = JSON.parse(JSON.stringify(newRosterId));
            
            for (let index = 0; index < purchUnitStatsJson.length; index++) { 
                await PurchasableUnitsFunctions.insertUserRosterStat(newRosterIdJson[0].id, purchUnitStatsJson[index].stat_fk, purchUnitStatsJson[index].value);
            };

            res.send();
        }
    }
});

app.post("/services/roster/unit/stats/purchase/:session_key", async (req, res) => {

    let session = (req as any).session
    
    var userFk = session.user_id;

    var unitToUpgrade = req.body.unit_id;
    var deltas = req.body.deltas;
    var stats = req.body.stats;

    //console.log(unitToUpgrade);
    //console.log(deltas);
    //console.log(stats);

    var rosterId = await PurchasableUnitsFunctions.getUserRosterByUnitId(userFk, unitToUpgrade);
    var rosterIdJson = JSON.parse(JSON.stringify(rosterId));

    if(rosterId != null){
        for (let index = 0; index < stats.length; index++) { 
            var statDetails = await StatsFunctions.getStatByName(stats[index]);
            var statDetailsJson = JSON.parse(JSON.stringify(statDetails));

            if(statDetailsJson != null){
                //console.log(rosterIdJson[0].id + ' ' + statDetailsJson[0].id + ' ' + deltas[index]);
                await UserFunctions.updateRosterStat(deltas[index], rosterIdJson[0].id, statDetailsJson[0].id);
            }
        };
    }

    res.send();
});

//Expand Barracks
app.post("/services/roster/unlock/:session_key", async (req, res) => {

    let session = (req as any).session

    await UserFunctions.expandUserBarracks(session.user_id);

    res.send();
});

app.post("/services/game/location/:session_key", (req, res) => {
    // do something here with location info maybe? idk what
    res.send();
});

// notify server if steam overlay is enabled
app.post("/services/session/steam/overlay/:session_key/:state", async (req, res) => {
    // idk what the server does with this info
    //console.log("TEST");
    res.send();
})

http.createServer(app).listen(3300);