import { execute } from "../mysql.connector";

import { PurchasableUnitsQueries } from "./purchasableUnits.queries";
import { PurchasableUnit, PurchasableUnitStat, PurchasableUnitStatRaw } from "./purchasableUnits.model";
import * as UsersModels from '../users/users.model';

/**
 * gets all purchasable units
 */
export const getPurchasableUnits = async () => {
  return execute<PurchasableUnit[]>(PurchasableUnitsQueries.GetPurchasableUnits, []);
};

/**
 * gets purchasable unit by def id
 */
export const getPurchasableUnitByDefId = async (def_id: PurchasableUnit['def_id']) => {
  return execute<PurchasableUnit>(PurchasableUnitsQueries.GetPurchasableUnitByDefId, [def_id]);
};

/**
 * Get User's Roster max unit_id by unit id
 */
export const getRosterMaxUnitId = async (user_fk: number, unit_id: string): Promise<UsersModels.Roster> => {
  return execute<UsersModels.Roster>(PurchasableUnitsQueries.GetRosterMaxUnitId, [user_fk, unit_id]);
};

/**
 * gets user's roster ID based on unit id provided
 */
export const getUserRosterByUnitId = async (user_fk: number, unit_id: string) => {
  return execute<number>(PurchasableUnitsQueries.GetUserRosterByUnitId, [user_fk, unit_id]);
};

/**
 * gets purchasable unit's stats
 */
export const getPurchasableUnitStatsById = async (purchasable_unit_fk: PurchasableUnitStat['purchasable_unit_fk']) => {
  return execute<PurchasableUnitStat[]>(PurchasableUnitsQueries.GetPurchasableUnitStatsById, [purchasable_unit_fk]);
};

/**
 * gets purchasable unit's stats
 */
export const getPurchasableUnitStatsRawById = async (purchasable_unit_fk: number) => {
  return execute<PurchasableUnitStatRaw[]>(PurchasableUnitsQueries.GetPurchasableUnitStatsRawById, [purchasable_unit_fk]);
};

/**
 * Insert Purchasable Unit data to Roster - triggers when hiring new units
 */
export const insertUserRoster = async (new_roster: UsersModels.AddRoster) => {
  return execute<UsersModels.Roster>(PurchasableUnitsQueries.InsertUserRoster, [new_roster.user_fk, new_roster.class_fk, new_roster.unit_id, new_roster.entity_class, new_roster.name, new_roster.appearance_acquires, new_roster.appearance_index]);
};

/**
 * Insert Purchasable Unit Stat data to Roster - triggers when hiring new units
 */
export const insertUserRosterStat = async (roster_fk: number, stat_fk: number, value: number) => {
  return execute<UsersModels.Roster>(PurchasableUnitsQueries.InsertUserRosterStat, [roster_fk, 4, stat_fk, value]);
};