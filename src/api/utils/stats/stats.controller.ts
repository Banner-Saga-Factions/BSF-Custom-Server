import * as StatsModel from './stats.model';
import * as StatsServices from './stats.service';

/**
 * get stat by name
 */
export const getStatByName = async (stat: string): Promise<StatsModel.Stat> => {
  return await StatsServices.getStatByName(stat);
};

/**
 * Get logged in User's roster's stats (all stats)
 */
export const getEntityDefsStats = async (entitydef_fk: number) : Promise<StatsModel.DefStat> => {
  return await StatsServices.getEntityDefsStatsByDefId(entitydef_fk);
};

/**
* gets user's roster unit stat (single stat)
*/
export const getUserDefStat = async (entitydef_fk: StatsModel.DefStat['entitydef_fk'], stats_fk: number) => {
  return await StatsServices.getUserRosterStat(entitydef_fk, stats_fk);
};

/**
 * Insert Purchasable Unit Stat data to Roster - triggers when hiring new units
 */
export const insertUserEntityStat = async (entitydef_fk: number, stats_fk: number, value: number) => {
  await StatsServices.insertUserEntityStat(entitydef_fk, stats_fk, value);
};

/**
 * updates entity's RANK stat by 1
 */
export const updateEntityRank = async (entitydef_fk: StatsModel.DefStat['entitydef_fk']) => {
  return await StatsServices.updateEntityRank(entitydef_fk);
};

/**
 * updates roster's stat by id
 */
export const updateEntityStat = async (value: number, entitydef_fk: number, stats_fk: number) => {
  return await StatsServices.updateRosterStat(value, entitydef_fk, stats_fk);
};

/**
* Delete user's Entity / Unit stats
*/
export const deleteEntityStats = async (user_fk: string, unit_id: string) => {
  await StatsServices.deleteEntityStats(user_fk, unit_id);
};
