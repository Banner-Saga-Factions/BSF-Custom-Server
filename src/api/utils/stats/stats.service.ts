import { execute } from "../mysql.connector";

import * as StatsQueries from "./stats.queries";
import * as StatsModels from "./stats.model";

/**
 * get stat by name
 */
export const getStatByName = async (stat: string) => {
  return execute<StatsModels.Stat>(StatsQueries.StatsQueries.GetStatByName, [stat]);
};

/**
 * gets user's party based on id provided
 */
export const getEntityDefsStatsByDefId = async (entitydef_fk: StatsModels.DefStat['entitydef_fk']) => {
  return execute<StatsModels.DefStat>(StatsQueries.StatsQueries.GetEntityDefStatsByDefId, [entitydef_fk]);
};

/**
 * gets user's roster unit stat (single stat)
 */
export const getUserRosterStat = async (entitydef_fk: StatsModels.DefStat['entitydef_fk'], stats_fk: number) => {
  return execute<StatsModels.DefStat>(StatsQueries.StatsQueries.GetUserDefStat, [entitydef_fk, stats_fk]);
};

/**
 * Insert Purchasable Unit Stat data to Roster - triggers when hiring new units
 */
export const insertUserEntityStat = async (entitydef_fk: number, stats_fk: number, value: number) => {
  return execute<StatsModels.DefStat>(StatsQueries.StatsQueries.InsertUserEntityStat, [entitydef_fk, stats_fk, value]);
};

/**
 * updates roster's RANK stat by 1
 */
export const updateEntityRank = async (entitydef_fk: StatsModels.DefStat['entitydef_fk']) => {
  return execute<StatsModels.DefStat>(StatsQueries.StatsQueries.UpdateEntityStat_Rank, [entitydef_fk]);
};

/**
 * updates roster's stat by id
 */
export const updateRosterStat = async (value: StatsModels.UpdateDefStat['value'], entitydef_fk: StatsModels.UpdateDefStat['entitydef_fk'], stats_fk: StatsModels.UpdateDefStat['stats_fk']) => {
  return execute<StatsModels.UpdateDefStat>(StatsQueries.StatsQueries.UpdateEntityStat, [value, entitydef_fk, stats_fk]);
};

/**
 * Delete user's Roster / Unit stats
 */
export const deleteEntityStats = async (user_fk: string, unit_id: string) => {
  execute<StatsModels.DefStat>(StatsQueries.StatsQueries.DeleteUserEntityStats, [user_fk, unit_id]);
};