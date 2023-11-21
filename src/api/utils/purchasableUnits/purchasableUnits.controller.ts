import * as PurchasableUnitsModels from './purchasableUnits.model';
import * as PurchasableUnitsServices from './purchasableUnits.service';

/**
 * Get all purchasable units
 */
export const getPurchasableUnits = async (): Promise<PurchasableUnitsModels.PurchasableUnit[]> => {
  return await PurchasableUnitsServices.getPurchasableUnits();
};

/**
 * Get purchasable unit by def Id
 */
export const getPurchasableUnitByDefId = async (entitydef_fk: number): Promise<PurchasableUnitsModels.PurchasableUnit> => {
  return await PurchasableUnitsServices.getPurchasableUnitByDefId(entitydef_fk);
};

/**
 * Get purchasable unit stats data (without IDs) based on id provided

export const getPurchasableUnitStats = async (purchasable_unit_fk: number) => {
  try {
    const purchasableUnitStats = await PurchasableUnitsServices.getPurchasableUnitStatsById(purchasable_unit_fk);
    return purchasableUnitStats;
  } catch (error) {
    return [];
  }
}; */

/**
 * Get purchasable unit stats data (with IDs) based on id provided

export const getPurchasableUnitStatsRaw = async (purchasable_unit_fk: number) => {
  try {
    const purchasableUnitStats = await PurchasableUnitsServices.getPurchasableUnitStatsRawById(purchasable_unit_fk);
    return purchasableUnitStats;
  } catch (error) {
    return [];
  }
}; */