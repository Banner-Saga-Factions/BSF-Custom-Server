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
export const getPurchasableUnitByDefId = async (entitydef_fk: PurchasableUnit['entitydef_fk']) => {
  return execute<PurchasableUnit>(PurchasableUnitsQueries.GetPurchasableUnitByDefId, [entitydef_fk]);
};

/**
 * gets purchasable unit's stats
 
export const getPurchasableUnitStatsById = async (purchasable_unit_fk: PurchasableUnitStat['purchasable_unit_fk']) => {
  return execute<PurchasableUnitStat[]>(PurchasableUnitsQueries.GetPurchasableUnitStatsById, [purchasable_unit_fk]);
};*/

/**
 * gets purchasable unit's stats

export const getPurchasableUnitStatsRawById = async (purchasable_unit_fk: number) => {
  return execute<PurchasableUnitStatRaw[]>(PurchasableUnitsQueries.GetPurchasableUnitStatsRawById, [purchasable_unit_fk]);
}; */