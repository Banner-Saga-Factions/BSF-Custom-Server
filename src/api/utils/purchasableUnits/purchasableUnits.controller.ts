import * as PurchasableUnitsModels from './purchasableUnits.model';
import * as PurchasableUnitsServices from './purchasableUnits.service';
import * as UsersModels from '../users/users.model';

/**
 * Get all purchasable units
 */
export const getPurchasableUnits = async (): Promise<PurchasableUnitsModels.PurchasableUnit[]> => {
  return await PurchasableUnitsServices.getPurchasableUnits();
};

/**
 * Get purchasable unit by def Id
 */
export const getPurchasableUnitByDefId = async (def_id: string): Promise<PurchasableUnitsModels.PurchasableUnit> => {
  return await PurchasableUnitsServices.getPurchasableUnitByDefId(def_id);
};

/**
 * Get User's Roster max unit_id by unit id
 */
export const getRosterMaxUnitId = async (user_fk: number, unit_id: string): Promise<UsersModels.Roster> => {
  return await PurchasableUnitsServices.getRosterMaxUnitId(user_fk, unit_id);
};

/**
 * gets user's roster ID based on unit id provided
 */
export const getUserRosterByUnitId = async (user_fk: number, unit_id: string) => {
  return await PurchasableUnitsServices.getUserRosterByUnitId(user_fk, unit_id);
};

/**
 * Get purchasable unit stats data (without IDs) based on id provided
 */
export const getPurchasableUnitStats = async (purchasable_unit_fk: number) => {
  try {
    const purchasableUnitStats = await PurchasableUnitsServices.getPurchasableUnitStatsById(purchasable_unit_fk);
    return purchasableUnitStats;
  } catch (error) {
    return [];
  }
};

/**
 * Get purchasable unit stats data (with IDs) based on id provided
 */
export const getPurchasableUnitStatsRaw = async (purchasable_unit_fk: number) => {
  try {
    const purchasableUnitStats = await PurchasableUnitsServices.getPurchasableUnitStatsRawById(purchasable_unit_fk);
    return purchasableUnitStats;
  } catch (error) {
    return [];
  }
};

/**
 * Insert Purchasable Unit data to Roster - triggers when hiring new units
 */
export const insertUserRoster = async (new_roster: UsersModels.AddRoster) => {
  await PurchasableUnitsServices.insertUserRoster(new_roster);
};

/**
 * Insert Purchasable Unit Stat data to Roster - triggers when hiring new units
 */
export const insertUserRosterStat = async (roster_fk: number, stat_fk: number, value: number) => {
  await PurchasableUnitsServices.insertUserRosterStat(roster_fk, stat_fk, value);
};
